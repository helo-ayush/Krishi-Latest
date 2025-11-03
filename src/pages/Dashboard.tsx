import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Navbar } from '@/components/Navbar';
import { ImageUpload } from '@/components/ImageUpload';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Search, MessageCircle, Send, TrendingUp, MapPin } from 'lucide-react';
import { VoiceChat } from '@/components/VoiceChat';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

const Dashboard = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [detections, setDetections] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
        setLoading(false);
        loadDetections(session.user.id);
        loadNotices();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });


    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);


  const loadDetections = async (userId: string) => {
    const { data } = await supabase
      .from('disease_detections')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (data) setDetections(data);
  };

  const loadNotices = async () => {
    const { data } = await supabase
      .from('community_notices')
      .select('*')
      .eq('is_trending', true)
      .order('created_at', { ascending: false })
      .limit(3);
    if (data) setNotices(data);
  };

  const handleDetect = async () => {
    if (!selectedFile || !user) return;

    setIsAnalyzing(true);
    try {
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      let imageUrl: string | null = null;

      try {
        const { error: uploadError } = await supabase.storage
          .from('crop-images')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('crop-images').getPublicUrl(filePath);
        imageUrl = publicUrl;
      } catch (e: any) {
        console.warn('Storage upload failed, using base64 fallback:', e?.message || e);
        const reader = new FileReader();
        imageUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(selectedFile);
        });
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
      
      const functionData = {
        disease_name,
        confidence: Math.min(confidence, 0.99),
        severity,
        recommendations: detailedRecommendations,
      };

      const { error: insertError } = await supabase.from('disease_detections').insert({
        user_id: user.id,
        image_url: imageUrl,
        disease_name: functionData.disease_name,
        confidence: functionData.confidence,
        severity: functionData.severity,
        recommendations: functionData.recommendations,
      });

      if (insertError) throw insertError;

      toast.success(t('detection.uploadSuccess'));
      loadDetections(user.id);
      setSelectedFile(null);
    } catch (error: any) {
      toast.error(error.message || t('detection.uploadError'));
    } finally {
      setIsAnalyzing(false);
    }
  };


  const handleChat = async (inputText?: string) => {
    const textToSend = inputText || chatInput;
    if (!textToSend.trim() || isChatting) return;

    const userMessage = { role: 'user', content: textToSend };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setIsChatting(true);

    try {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
        toast.error('Gemini API key not configured');
        setIsChatting(false);
        return;
      }

      // Convert message history to Gemini format
      const geminiMessages = [...chatMessages, userMessage].map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            maxOutputTokens: 500,
            temperature: 0.3,
          }
        }),
      });

      if (!resp.ok) throw new Error('Failed to get response from Gemini');

      const data = await resp.json();
      const assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

      setChatMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);

    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Chat error');
    } finally {
      setIsChatting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-gradient-to-b from-background to-muted/20" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {t('dashboard.title')}
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Upload Section */}
            <Card className="border-primary/20 shadow-glow">
              <CardHeader>
                <CardTitle>{t('dashboard.uploadTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ImageUpload onImageSelect={setSelectedFile} isAnalyzing={isAnalyzing} />
                {selectedFile && !isAnalyzing && (
                  <Button
                    onClick={handleDetect}
                    size="lg"
                    className="w-full mt-6 bg-gradient-to-r from-primary to-accent"
                  >
                    <Search className="mr-2 h-5 w-5" />
                    {t('hero.detectButton')}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Recent Detections */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>{t('dashboard.recentTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                {detections.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    {t('dashboard.noDetections')}
                  </p>
                ) : (
                  <div className="space-y-4">
                    {detections.map((detection) => (
                      <div
                        key={detection.id}
                        className="flex gap-4 p-4 rounded-lg bg-gradient-to-br from-accent/5 to-primary/5 border border-primary/10"
                      >
                        <img
                          src={detection.image_url}
                          alt="Detection"
                          className="w-24 h-24 object-cover rounded-lg"
                        />
                        <div className="flex-1">
                          <h3 className="font-semibold">{detection.disease_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {t('detection.confidence')}: {(detection.confidence * 100).toFixed(0)}% |{' '}
                            {t('detection.severity')}: {detection.severity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            {/* Voice Chat - Featured Component */}
            <VoiceChat language={i18n.language} />

            {/* Community Notices */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('dashboard.communityTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {notices.map((notice) => (
                    <div
                      key={notice.id}
                      className="p-4 rounded-lg bg-gradient-to-br from-secondary/10 to-accent/10 border border-secondary/20"
                    >
                      <h4 className="font-semibold text-sm mb-1">{notice.title}</h4>
                      <p className="text-xs text-muted-foreground mb-2">{notice.description}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <MapPin className="h-3 w-3" />
                        <span>{notice.location}</span>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full" asChild>
                    <a href="/community">{t('dashboard.showMore')}</a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Text Chatbot */}
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-primary" />
                  {t('dashboard.chatbot')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="h-64 overflow-y-auto space-y-3 p-4 rounded-lg bg-muted/30 scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent">
                    {chatMessages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center">
                        Ask me anything about crop diseases!
                      </p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg text-sm ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground ml-8'
                              : 'bg-card/80 mr-8 border border-border glass-card'
                          }`}
                        >
                          {msg.role === 'user' ? (
                            <span className="whitespace-pre-wrap break-words">{msg.content}</span>
                          ) : (
                            <MarkdownRenderer 
                              content={msg.content} 
                              className={msg.role === 'user' ? 'text-primary-foreground prose-invert' : ''}
                            />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                      placeholder="Type your question..."
                      disabled={isChatting}
                    />
                    <Button onClick={() => handleChat()} disabled={isChatting} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
