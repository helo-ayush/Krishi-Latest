import { useEffect, useState } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { ThumbsUp, MessageCircle, MapPin, Calendar, X, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface DiseasePost {
  id: string;
  farmer_name: string;
  farmer_avatar: string | null;
  disease_title: string;
  disease_description: string;
  disease_image: string;
  location: string;
  upvotes: number;
  created_at: string;
  comment_count?: number;
  user_upvoted?: boolean;
}

interface Comment {
  id: string;
  commenter_name: string;
  comment_text: string;
  created_at: string;
}

const Community = () => {
  const [posts, setPosts] = useState<DiseasePost[]>([]);
  const [selectedPost, setSelectedPost] = useState<DiseasePost | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  const [isUpvoting, setIsUpvoting] = useState(false); // Prevent rapid clicks
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Get or create persistent user ID
  const [userId] = useState(() => {
    let id = localStorage.getItem('cropswag_user_id');
    if (!id) {
      id = `anon_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('cropswag_user_id', id);
    }
    return id;
  });

  // New post form state
  const [newPost, setNewPost] = useState({
    farmerName: '',
    location: '',
    diseaseTitle: '',
    description: '',
    imageUrl: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // New comment form state
  const [newComment, setNewComment] = useState({
    commenterName: '',
    commentText: ''
  });

  useEffect(() => {
    loadPosts();
    loadUserProfile();
  }, []);

  const loadUserProfile = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUser(session.user);
      
      // Fetch user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      
      if (profile) {
        setUserProfile(profile);
        // Pre-fill comment name
        setNewComment(prev => ({ ...prev, commenterName: profile.full_name || session.user.email?.split('@')[0] || '' }));
      } else {
        // Fallback to email username
        setNewComment(prev => ({ ...prev, commenterName: session.user.email?.split('@')[0] || '' }));
      }
    }
  };

  const loadPosts = async () => {
    const { data: postsData } = await supabase
      .from('disease_posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (postsData) {
      // Get comment counts for each post
      const postsWithCounts = await Promise.all(
        postsData.map(async (post) => {
          const { count } = await supabase
            .from('post_comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id);

          // Check if user upvoted
          const { data: upvoteData } = await supabase
            .from('post_upvotes')
            .select('id')
            .eq('post_id', post.id)
            .eq('user_id', userId)
            .single();

          return {
            ...post,
            comment_count: count || 0,
            user_upvoted: !!upvoteData
          };
        })
      );
      setPosts(postsWithCounts);
    }
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    
    if (data) setComments(data);
  };

  const handleUpvote = async (post: DiseasePost, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Prevent any clicking while processing
    if (isUpvoting) return;
    setIsUpvoting(true);
    
    // Optimistic UI update - update state immediately
    const newUpvotedState = !post.user_upvoted;
    const newUpvoteCount = post.user_upvoted ? post.upvotes - 1 : post.upvotes + 1;
    
    // Update UI immediately
    setPosts(prevPosts => 
      prevPosts.map(p => 
        p.id === post.id 
          ? { ...p, user_upvoted: newUpvotedState, upvotes: newUpvoteCount }
          : p
      )
    );
    
    // Update selected post if modal is open
    if (selectedPost?.id === post.id) {
      setSelectedPost(prev => prev ? { ...prev, user_upvoted: newUpvotedState, upvotes: newUpvoteCount } : null);
    }
    
    try {
      if (post.user_upvoted) {
        // Remove upvote
        await supabase
          .from('post_upvotes')
          .delete()
          .eq('post_id', post.id)
          .eq('user_id', userId);

        await supabase
          .from('disease_posts')
          .update({ upvotes: post.upvotes - 1 })
          .eq('id', post.id);
      } else {
        // Add upvote - simple insert (unique constraint will prevent duplicates)
        console.log('Attempting to insert upvote:', { post_id: post.id, user_id: userId });
        
        const { error: insertError, data: insertData } = await supabase
          .from('post_upvotes')
          .insert({ 
            post_id: post.id, 
            user_id: userId 
          })
          .select();
        
        console.log('Insert result:', { insertError, insertData });
        
        if (insertError) {
          console.error('Upvote error details:', {
            message: insertError.message,
            code: insertError.code,
            details: insertError.details,
            hint: insertError.hint
          });
          
          // Revert UI on error
          setPosts(prevPosts => 
            prevPosts.map(p => 
              p.id === post.id 
                ? { ...p, user_upvoted: post.user_upvoted, upvotes: post.upvotes }
                : p
            )
          );
          toast.error(`Failed to upvote: ${insertError.message}`);
          return;
        }

        const { error: updateError } = await supabase
          .from('disease_posts')
          .update({ upvotes: post.upvotes + 1 })
          .eq('id', post.id);
          
        if (updateError) {
          console.error('Update count error:', updateError);
          toast.error('Failed to update vote count');
        }
      }
    } catch (error) {
      console.error('Failed to update upvote:', error);
      // Revert UI on error
      setPosts(prevPosts => 
        prevPosts.map(p => 
          p.id === post.id 
            ? { ...p, user_upvoted: post.user_upvoted, upvotes: post.upvotes }
            : p
        )
      );
    } finally {
      setIsUpvoting(false);
    }
  };

  const openPostModal = (post: DiseasePost) => {
    setSelectedPost(post);
    loadComments(post.id);
    setShowModal(true);
    
    // Reset comment name when opening modal
    if (userProfile?.full_name) {
      setNewComment(prev => ({ ...prev, commenterName: userProfile.full_name }));
    } else if (user?.email) {
      setNewComment(prev => ({ ...prev, commenterName: user.email.split('@')[0] }));
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPost(null);
    setComments([]);
    setNewComment({ commenterName: '', commentText: '' });
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost) return;

    const { error } = await supabase
      .from('post_comments')
      .insert([{
        post_id: selectedPost.id,
        commenter_name: newComment.commenterName,
        comment_text: newComment.commentText
      }]);

    if (error) {
      toast.error('Failed to post comment');
    } else {
      toast.success('Comment posted successfully!');
      setNewComment({ commenterName: '', commentText: '' });
      loadComments(selectedPost.id);
      loadPosts(); // Refresh to update comment count
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 2MB for base64)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File size must be less than 2MB');
        return;
      }
      // Check file type
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setSelectedFile(file);
      // Show preview by converting to base64
      convertToBase64(file);
    }
  };

  const convertToBase64 = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Update imageUrl with base64 data
      setNewPost(prev => ({ ...prev, imageUrl: base64String }));
    };
    reader.onerror = () => {
      toast.error('Failed to read image file');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitNewPost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let imageUrl = newPost.imageUrl;

    // Use default image if no image provided
    if (!imageUrl) {
      imageUrl = 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800';
    }
    
    const { error } = await supabase
      .from('disease_posts')
      .insert([{
        farmer_name: newPost.farmerName,
        location: newPost.location,
        disease_title: newPost.diseaseTitle,
        disease_description: newPost.description,
        disease_image: imageUrl,
        farmer_avatar: `https://api.dicebear.com/7.x/avatars/svg?seed=${newPost.farmerName}`,
        upvotes: 0
      }]);

    if (error) {
      toast.error('Failed to create post');
    } else {
      toast.success('Disease report posted successfully!');
      setShowNewPostModal(false);
      setNewPost({ farmerName: '', location: '', diseaseTitle: '', description: '', imageUrl: '' });
      setSelectedFile(null);
      loadPosts();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Community Disease Alerts
          </h1>
          <p className="text-lg text-muted-foreground mb-6">
            Share and discover crop diseases in your region
          </p>
          <Button
            onClick={() => setShowNewPostModal(true)}
            className="bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4 mr-2" />
            Post New Disease Report
          </Button>
        </div>

        {/* Disease Posts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Card
              key={post.id}
              className="group cursor-pointer hover:shadow-xl transition-all duration-300 border-primary/20 hover:border-primary/40 overflow-hidden"
              onClick={() => openPostModal(post)}
            >
              {/* Disease Image */}
              <div className="relative h-48 overflow-hidden">
                <img
                  src={post.disease_image}
                  alt={post.disease_title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              </div>

              <CardContent className="p-4">
                {/* Title & Description */}
                <h3 className="font-bold text-lg mb-2 line-clamp-1 group-hover:text-primary transition-colors">
                  {post.disease_title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {post.disease_description}
                </p>

                {/* Farmer Info */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={post.farmer_avatar || undefined} />
                    <AvatarFallback>{post.farmer_name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{post.farmer_name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{post.location}</span>
                    </div>
                  </div>
                </div>

                {/* Actions & Stats */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={(e) => handleUpvote(post, e)}
                      className={`flex items-center gap-1.5 text-sm transition-colors hover:scale-110 ${
                        post.user_upvoted ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                      }`}
                    >
                      <ThumbsUp className={`h-4 w-4 ${post.user_upvoted ? 'fill-current' : ''}`} />
                      <span className="font-semibold">{post.upvotes}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPostModal(post);
                      }}
                      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors hover:scale-110"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>{post.comment_count}</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Post Detail Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <button
            onClick={closeModal}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-50"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          {selectedPost && (
            <div className="pt-8">
              {/* Full Image */}
              <img
                src={selectedPost.disease_image}
                alt={selectedPost.disease_title}
                className="w-full h-64 md:h-96 object-cover rounded-lg mb-6"
              />

              {/* Post Header */}
              <DialogHeader className="mb-4">
                <DialogTitle className="text-2xl md:text-3xl">
                  {selectedPost.disease_title}
                </DialogTitle>
              </DialogHeader>

              {/* Farmer Info */}
              <div className="flex items-center gap-3 mb-6 pb-6 border-b">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedPost.farmer_avatar || undefined} />
                  <AvatarFallback>{selectedPost.farmer_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedPost.farmer_name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedPost.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(selectedPost.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-2">Description</h3>
                <p className="text-muted-foreground leading-relaxed">
                  {selectedPost.disease_description}
                </p>
              </div>

              {/* Upvote Button */}
              <div className="mb-6">
                <Button
                  onClick={(e) => {
                    handleUpvote(selectedPost, e);
                    setSelectedPost({ ...selectedPost, user_upvoted: !selectedPost.user_upvoted, upvotes: selectedPost.user_upvoted ? selectedPost.upvotes - 1 : selectedPost.upvotes + 1 });
                  }}
                  variant={selectedPost.user_upvoted ? 'default' : 'outline'}
                  className={selectedPost.user_upvoted ? 'bg-primary' : ''}
                >
                  <ThumbsUp className={`h-4 w-4 mr-2 ${selectedPost.user_upvoted ? 'fill-current' : ''}`} />
                  {selectedPost.user_upvoted ? 'Upvoted' : 'Upvote'} ({selectedPost.upvotes})
                </Button>
              </div>

              {/* Comments Section */}
              <div>
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Comments ({comments.length})
                </h3>
                
                {/* Add Comment Form */}
                <form onSubmit={handleSubmitComment} className="mb-6 bg-muted/30 rounded-lg p-4">
                  <div className="space-y-3">
                    {!user && (
                      <div>
                        <Input
                          value={newComment.commenterName}
                          onChange={(e) => setNewComment({ ...newComment, commenterName: e.target.value })}
                          placeholder="Your name"
                          required
                          className="bg-background"
                        />
                      </div>
                    )}
                    {user && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <span>Commenting as: <strong className="text-foreground">{newComment.commenterName}</strong></span>
                      </div>
                    )}
                    <div>
                      <Textarea
                        value={newComment.commentText}
                        onChange={(e) => setNewComment({ ...newComment, commentText: e.target.value })}
                        placeholder="Write your comment..."
                        rows={3}
                        required
                        className="bg-background"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" size="sm" className="bg-gradient-to-r from-primary to-accent">
                        Post Comment
                      </Button>
                    </div>
                  </div>
                </form>

                {/* Comments List */}
                {comments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No comments yet. Be the first to comment!</p>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="bg-muted/50 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{comment.commenter_name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-sm">{comment.commenter_name}</p>
                              <span className="text-xs text-muted-foreground">
                                {new Date(comment.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{comment.comment_text}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* New Post Modal */}
      <Dialog open={showNewPostModal} onOpenChange={setShowNewPostModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <button
            onClick={() => {
              setShowNewPostModal(false);
              setSelectedFile(null);
              setNewPost(prev => ({ ...prev, imageUrl: '' }));
            }}
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-50"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>

          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-2xl">Report New Disease</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmitNewPost} className="flex flex-col flex-1 overflow-hidden">
            <div className="space-y-4 overflow-y-auto px-1" style={{ maxHeight: 'calc(90vh - 180px)' }}>
            <div>
              <Label htmlFor="farmerName">Your Name *</Label>
              <Input
                id="farmerName"
                value={newPost.farmerName}
                onChange={(e) => setNewPost({ ...newPost, farmerName: e.target.value })}
                placeholder="Enter your name"
                required
              />
            </div>

            <div>
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={newPost.location}
                onChange={(e) => setNewPost({ ...newPost, location: e.target.value })}
                placeholder="e.g., Punjab, India"
                required
              />
            </div>

            <div>
              <Label htmlFor="diseaseTitle">Disease Title *</Label>
              <Input
                id="diseaseTitle"
                value={newPost.diseaseTitle}
                onChange={(e) => setNewPost({ ...newPost, diseaseTitle: e.target.value })}
                placeholder="e.g., Late Blight on Tomatoes"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={newPost.description}
                onChange={(e) => setNewPost({ ...newPost, description: e.target.value })}
                placeholder="Describe the symptoms and affected area..."
                rows={4}
                required
              />
            </div>

            <div>
              <Label htmlFor="imageUpload">Disease Image *</Label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    id="imageUpload"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="cursor-pointer"
                  />
                </div>
                
                {/* Preview selected image */}
                {selectedFile && newPost.imageUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-primary">✓</span>
                      <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                    <div className="relative w-full h-48 rounded-lg overflow-hidden border">
                      <img
                        src={newPost.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setNewPost(prev => ({ ...prev, imageUrl: '' }));
                      }}
                    >
                      Remove Image
                    </Button>
                  </div>
                )}
                
                {!selectedFile && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Or paste image URL below (max 2MB for file upload)
                    </p>
                    <Input
                      id="imageUrl"
                      value={newPost.imageUrl}
                      onChange={(e) => setNewPost({ ...newPost, imageUrl: e.target.value })}
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                )}
              </div>
            </div>

            </div>
            
            {/* Fixed bottom buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t mt-4 flex-shrink-0 bg-background">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowNewPostModal(false);
                  setSelectedFile(null);
                  setNewPost(prev => ({ ...prev, imageUrl: '' }));
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                className="bg-gradient-to-r from-primary to-accent"
              >
                Post Disease Report
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Community;
