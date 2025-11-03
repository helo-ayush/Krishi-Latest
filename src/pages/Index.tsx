import { useTranslation } from 'react-i18next';
import { Navbar } from '@/components/Navbar';
import { ImageUpload } from '@/components/ImageUpload';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Search, FileCheck, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import heroImage from '@/assets/hero-crop-field.jpg';

const Index = () => {
  const { t, i18n } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleImageSelect = (file: File) => {
    setSelectedFile(file);
    setResult(null);
  };

  const handleDetect = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    try {
      let imageUrl: string;

      // Check if user is logged in
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // For authenticated users, attempt upload; if bucket missing, fallback to base64
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${session.user.id}/${fileName}`;

        try {
          const { error: uploadError } = await supabase.storage
            .from('crop-images')
            .upload(filePath, selectedFile);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('crop-images')
            .getPublicUrl(filePath);

          imageUrl = publicUrl;
        } catch (e: any) {
          console.warn('Storage upload failed for auth user, using base64 fallback:', e?.message || e);
          const reader = new FileReader();
          imageUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        }
      } else {
        // For anonymous users, try uploading to public folder first
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `public/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('crop-images')
          .upload(filePath, selectedFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          // If upload fails, convert to base64 data URL as fallback
          console.log('Storage upload failed, using base64 fallback:', uploadError.message);
          const reader = new FileReader();
          imageUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(selectedFile);
          });
        } else {
          // Upload successful, get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('crop-images')
            .getPublicUrl(filePath);
          imageUrl = publicUrl;
        }
      }

      // Detect disease using local plant classification
      const reader = new FileReader();
      const imageData = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });

      // Create image element
      const img = new Image();
      img.src = imageData;
      await new Promise((resolve) => (img.onload = resolve));

      // Simple classification based on image analysis
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      
      const imageData_ = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData_?.data || new Uint8ClampedArray();
      
      // Basic color analysis
      let greenPixels = 0, brownPixels = 0, yellowPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (g > r + 20 && g > b + 20) greenPixels++; // green
        else if (r > 100 && g < 100 && b < 100) brownPixels++; // brown spots
        else if (r > 150 && g > 120 && b < 100) yellowPixels++; // yellow
      }
      
      const total = greenPixels + brownPixels + yellowPixels;
      const brownRatio = brownPixels / total;
      const yellowRatio = yellowPixels / total;
      
      let disease_name = 'Healthy Plant';
      let confidence = 0.6;
      let severity: 'low' | 'medium' | 'high' = 'low';
      
      if (brownRatio > 0.3) {
        disease_name = 'Leaf Spot / Brown Spot Disease';
        confidence = 0.7 + brownRatio * 0.3;
        severity = brownRatio > 0.5 ? 'high' : 'medium';
      } else if (yellowRatio > 0.2) {
        disease_name = 'Rust or Yellow Leaf Disease';
        confidence = 0.65 + yellowRatio * 0.3;
        severity = yellowRatio > 0.4 ? 'high' : 'medium';
      }
      
      // Get detailed recommendations from Gemini API
      let detailedRecommendations = 'Plant appears healthy. Continue regular monitoring and maintenance.';
      
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      console.log('Gemini Key:', geminiKey ? 'Present' : 'Missing');
      console.log('Disease Name:', disease_name);
      
      if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
        try {
          console.log('Calling Gemini API for:', disease_name);
          const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an expert agricultural pathologist. Provide detailed treatment recommendations for "${disease_name}" in plants. Include:

1. **Immediate Actions** (what to do right now)
2. **Treatment Options** (fungicides, organic treatments)
3. **Prevention** (how to prevent future occurrences)
4. **Monitoring** (what to watch for)

Format with markdown headers and bullet points. Keep it practical and actionable for farmers. Maximum 300 words.`
                }]
              }]
            })
          });
          
          console.log('Gemini Response Status:', geminiResponse.status);
          
          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json();
            console.log('Gemini Data:', geminiData);
            const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (aiText) {
              detailedRecommendations = aiText;
              console.log('Got recommendations from Gemini');
            }
          } else {
            const errorText = await geminiResponse.text();
            console.error('Gemini API error:', geminiResponse.status, errorText);
          }
        } catch (error) {
          console.error('Gemini API exception:', error);
        }
      } else {
        console.warn('Gemini API key not configured or invalid');
      }
      
      const result = {
        disease_name,
        confidence: Math.min(confidence, 0.99),
        severity,
        recommendations: detailedRecommendations,
      };

      setResult(result);
      toast.success(t('detection.uploadSuccess'));
    } catch (error: any) {
      console.error('Error:', error);
      toast.error(error.message || t('detection.uploadError'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url(${heroImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute top-20 left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '4s' }}></div>
      </div>

      <Navbar />

      {/* Hero Section */}
      <section className="relative py-20 overflow-hidden">
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center mb-12 animate-fade-in-scale">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card border-primary/20 mb-6 animate-slide-in-up">
              <Camera className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{t('hero.badge')}</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent animate-gradient">
              {t('hero.title')}
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed animate-slide-in-up" style={{ animationDelay: '0.2s' }}>
              {t('hero.subtitle')}
            </p>
          </div>

          {/* Public Upload Section */}
          <div className="max-w-2xl mx-auto animate-fade-in-scale" style={{ animationDelay: '0.3s' }}>
            <Card className="glass-strong border-primary/30 shadow-glow hover-lift">
              <CardContent className="p-8 md:p-12">
                <ImageUpload onImageSelect={handleImageSelect} isAnalyzing={isAnalyzing} />
                {selectedFile && !isAnalyzing && (
                  <Button
                    onClick={handleDetect}
                    size="lg"
                    className="w-full mt-6 bg-gradient-to-r from-primary to-accent hover:shadow-glow transition-all duration-300 hover:scale-105"
                  >
                    <Search className="mr-2 h-5 w-5" />
                    {t('hero.detectButton')}
                  </Button>
                )}

                {result && (
                  <div className="mt-6 p-6 rounded-xl glass-card border-primary/20 animate-fade-in-scale hover-lift">
                    <div className="flex items-start gap-3 mb-4">
                      {result.severity === 'high' ? (
                        <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                      ) : (
                        <FileCheck className="h-6 w-6 text-primary flex-shrink-0" />
                      )}
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-2">{result.disease_name}</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('detection.confidence')}:</span>
                            <span className="ml-2 font-medium">
                              {(result.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('detection.severity')}:</span>
                            <span className="ml-2 font-medium capitalize">{result.severity}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            {t('detection.recommendations')}:
                          </p>
                          <div className="text-sm">
                            <MarkdownRenderer content={result.recommendations || ''} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 relative z-10">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl md:text-5xl font-bold text-center mb-16 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent animate-gradient">
            {t('features.title')}
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <Card className="glass-card border-primary/20 hover-lift hover-glow animate-fade-in-scale">
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow animate-float">
                  <Camera className="h-10 w-10 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{t('features.step1Title')}</h3>
                <p className="text-muted-foreground leading-relaxed">{t('features.step1Desc')}</p>
              </CardContent>
            </Card>

            <Card className="glass-card border-primary/20 hover-lift hover-glow animate-fade-in-scale" style={{ animationDelay: '0.1s' }}>
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent to-secondary flex items-center justify-center shadow-glow animate-float" style={{ animationDelay: '1s' }}>
                  <Search className="h-10 w-10 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{t('features.step2Title')}</h3>
                <p className="text-muted-foreground leading-relaxed">{t('features.step2Desc')}</p>
              </CardContent>
            </Card>

            <Card className="glass-card border-primary/20 hover-lift hover-glow animate-fade-in-scale" style={{ animationDelay: '0.2s' }}>
              <CardContent className="p-8 text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-secondary to-primary flex items-center justify-center shadow-glow animate-float" style={{ animationDelay: '2s' }}>
                  <FileCheck className="h-10 w-10 text-primary-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{t('features.step3Title')}</h3>
                <p className="text-muted-foreground leading-relaxed">{t('features.step3Desc')}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
