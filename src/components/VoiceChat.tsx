import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Volume2, VolumeX, MessageCircle, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

interface VoiceChatProps {
  language?: string;
}

export const VoiceChat = ({ language = 'en' }: VoiceChatProps) => {
  const { i18n } = useTranslation();
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [recognition, setRecognition] = useState<any>(null);
  const [synth, setSynth] = useState<SpeechSynthesis | null>(null);
  const [currentUtterance, setCurrentUtterance] = useState<SpeechSynthesisUtterance | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [showVoiceSettings, setShowVoiceSettings] = useState(false);
  const chatHistoryRef = useRef<any[]>([]);

  useEffect(() => {
    // Initialize Speech Recognition and Synthesis
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = false;
        recognitionInstance.interimResults = false;
        setRecognition(recognitionInstance);
      }

      if ('speechSynthesis' in window) {
        const synthInstance = window.speechSynthesis;
        setSynth(synthInstance);
        
        const loadVoices = () => {
          const voices = synthInstance.getVoices();
          setAvailableVoices(voices);
        };
        
        loadVoices();
        synthInstance.onvoiceschanged = loadVoices;
      }
    }

    return () => {
      if (recognition) {
        recognition.stop();
      }
      if (synth) {
        synth.cancel();
      }
    };
  }, []);

  // Language mapping
  const getSpeechLanguage = (langCode: string) => {
    const langMap: Record<string, string> = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'mr': 'mr-IN',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'zh': 'zh-CN',
    };
    return langMap[langCode] || 'en-US';
  };

  // Get the best voice
  const getBestVoice = (langCode: string): SpeechSynthesisVoice | null => {
    if (availableVoices.length === 0) return null;
    
    if (selectedVoiceName) {
      const selectedVoice = availableVoices.find(v => v.name === selectedVoiceName);
      if (selectedVoice) return selectedVoice;
    }
    
    const targetLang = getSpeechLanguage(langCode);
    const langPrefix = targetLang.split('-')[0];
    const preferredNames = ['Google', 'Microsoft', 'Samantha', 'Daniel', 'Veena', 'Karen', 'Moira', 'Zira', 'David', 'Ravi', 'Sahil', 'Neerja', 'Hemant', 'Kalpana'];
    
    let voice = availableVoices.find(v => 
      v.lang === targetLang && preferredNames.some(name => v.name.includes(name))
    );
    
    if (!voice) voice = availableVoices.find(v => v.lang === targetLang);
    if (!voice) voice = availableVoices.find(v => v.lang.startsWith(langPrefix) && preferredNames.some(name => v.name.includes(name)));
    if (!voice) voice = availableVoices.find(v => v.lang.startsWith(langPrefix));
    if (!voice) voice = availableVoices.find(v => preferredNames.some(name => v.name.includes(name)));
    
    return voice || availableVoices[0] || null;
  };

  // Get voices filtered by current language
  const getFilteredVoices = (): SpeechSynthesisVoice[] => {
    if (availableVoices.length === 0) return [];
    const targetLang = getSpeechLanguage(i18n.language || language || 'en');
    const langPrefix = targetLang.split('-')[0];
    
    // Return voices matching the current language, sorted by preference
    const matching = availableVoices.filter(v => 
      v.lang === targetLang || v.lang.startsWith(langPrefix)
    );
    
    if (matching.length > 0) return matching;
    return availableVoices;
  };

  const speakText = (text: string) => {
    if (!synth || !voiceEnabled) return;

    if (currentUtterance) {
      synth.cancel();
      setCurrentUtterance(null);
    }

    // Clean text for speech
    const cleanText = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#+\s+/gm, '')
      .replace(/^\*\s+/gm, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    const speechLang = getSpeechLanguage(i18n.language || language || 'en');
    utterance.lang = speechLang;
    
    const selectedVoice = getBestVoice(i18n.language || language || 'en');
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setCurrentUtterance(utterance);
    };
    
    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentUtterance(null);
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentUtterance(null);
    };

    synth.speak(utterance);
    setCurrentUtterance(utterance);
  };

  const stopSpeaking = () => {
    if (synth) {
      synth.cancel();
      if (currentUtterance) {
        currentUtterance.onend = null;
        currentUtterance.onerror = null;
        currentUtterance.onstart = null;
      }
      setIsSpeaking(false);
      setCurrentUtterance(null);
    }
  };

  const startVoiceInput = () => {
    if (!recognition) {
      toast.error('Speech recognition is not supported in your browser');
      return;
    }

    setIsListening(true);
    const speechLang = getSpeechLanguage(i18n.language || language || 'en');
    recognition.lang = speechLang;
    
    recognition.onresult = async (event: any) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      await handleVoiceQuery(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      toast.error(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopVoiceInput = () => {
    if (recognition) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleVoiceQuery = async (query: string) => {
    if (!query.trim() || isProcessing) return;

    setIsProcessing(true);

    try {
      const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!geminiKey || geminiKey === 'your_gemini_api_key_here') {
        toast.error('Gemini API key not configured');
        return;
      }

      const userMessage = { role: 'user', content: query };
      chatHistoryRef.current = [...chatHistoryRef.current, userMessage];

      // Call Gemini API directly
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: chatHistoryRef.current.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            maxOutputTokens: 150,
            temperature: 0.3,
          }
        }),
      });

      if (!resp.ok) throw new Error('Failed to get response from Gemini');

      const data = await resp.json();
      const assistantContent = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';

      if (assistantContent && voiceEnabled) {
        chatHistoryRef.current = [...chatHistoryRef.current, { role: 'assistant', content: assistantContent }];
        // Speak the response
        speakText(assistantContent);
      }
    } catch (error) {
      toast.error('Voice chat error');
      console.error('Voice chat error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="glass-strong border-primary/30 hover-lift">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Voice Chat Assistant
          </CardTitle>
          {synth && availableVoices.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowVoiceSettings(!showVoiceSettings)}
              className={`h-8 w-8 p-0 ${showVoiceSettings ? 'bg-primary/10' : ''}`}
              title="Voice settings"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Voice Settings */}
          {showVoiceSettings && synth && availableVoices.length > 0 && (
            <div className="p-3 rounded-lg glass-card border border-primary/20 animate-fade-in-scale">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium">Voice Selection</label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowVoiceSettings(false)}
                  className="h-6 w-6 p-0"
                >
                  ×
                </Button>
              </div>
              <Select
                value={selectedVoiceName || (getBestVoice(i18n.language || language || 'en')?.name || '')}
                onValueChange={(value) => {
                  setSelectedVoiceName(value);
                  stopSpeaking();
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {getFilteredVoices().map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-muted-foreground">
                  Using: <span className="font-medium">{getBestVoice(i18n.language || language || 'en')?.name || 'Default'}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const testText = i18n.language === 'hi' 
                      ? 'नमस्ते, यह एक परीक्षण है।'
                      : i18n.language === 'mr'
                      ? 'नमस्कार, हे एक चाचणी आहे।'
                      : i18n.language === 'es'
                      ? 'Hola, esta es una prueba.'
                      : i18n.language === 'fr'
                      ? 'Bonjour, ceci est un test.'
                      : i18n.language === 'zh'
                      ? '你好，这是一个测试。'
                      : 'Hello, this is a test voice message.';
                    speakText(testText);
                  }}
                  disabled={isSpeaking}
                  className="h-7 text-xs"
                >
                  {isSpeaking ? 'Speaking...' : 'Test Voice'}
                </Button>
              </div>
            </div>
          )}

          {/* Status indicator */}
          <div className="flex items-center justify-center h-32 rounded-xl glass-card border border-primary/20">
            {isListening ? (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
                  <Mic className="h-10 w-10 text-destructive" />
                </div>
                <p className="text-sm font-medium text-primary">Listening...</p>
                <p className="text-xs text-muted-foreground mt-1">Speak your question</p>
              </div>
            ) : isProcessing ? (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
                <p className="text-sm font-medium text-primary">Processing...</p>
                <p className="text-xs text-muted-foreground mt-1">Analyzing your question</p>
              </div>
            ) : isSpeaking ? (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-accent/20 flex items-center justify-center animate-pulse">
                  <Volume2 className="h-10 w-10 text-accent" />
                </div>
                <p className="text-sm font-medium text-accent">Speaking...</p>
                <p className="text-xs text-muted-foreground mt-1">AI is responding</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                  <Mic className="h-10 w-10 text-primary" />
                </div>
                <p className="text-sm font-medium">Ready to listen</p>
                <p className="text-xs text-muted-foreground mt-1">Click the microphone to start</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {recognition ? (
              <Button
                onClick={isListening ? stopVoiceInput : startVoiceInput}
                disabled={isProcessing || isSpeaking}
                size="lg"
                variant={isListening ? "destructive" : "default"}
                className={`h-16 w-16 rounded-full ${
                  isListening ? "animate-pulse bg-destructive" : "bg-gradient-to-r from-primary to-accent hover:shadow-glow"
                }`}
              >
                {isListening ? (
                  <MicOff className="h-6 w-6" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </Button>
            ) : (
              <div className="text-center">
                <Button disabled size="lg" variant="outline" className="h-16 w-16 rounded-full">
                  <Mic className="h-6 w-6" />
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Voice input not supported
                </p>
              </div>
            )}

            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                } else {
                  setVoiceEnabled(!voiceEnabled);
                  if (voiceEnabled) {
                    stopSpeaking();
                  }
                }
              }}
              className={`h-16 w-16 rounded-full ${
                isSpeaking ? "bg-destructive/10 hover:bg-destructive/20" : ""
              }`}
              title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            >
              {isSpeaking ? (
                <VolumeX className="h-6 w-6 text-destructive animate-pulse" />
              ) : voiceEnabled ? (
                <Volume2 className="h-6 w-6 text-primary" />
              ) : (
                <VolumeX className="h-6 w-6 text-muted-foreground" />
              )}
            </Button>
          </div>

          {/* Info text */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {isListening 
                ? "Speak clearly into your microphone..." 
                : isSpeaking 
                  ? "Listening to AI response..."
                  : "Click the microphone button to ask a question"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

