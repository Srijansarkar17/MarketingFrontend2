// src/pages/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Get the session from URL hash
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session error:', error);
          navigate('/login');
          return;
        }
        
        if (session?.user) {
          // Check if user profile exists
          const { data: existingProfile } = await supabase
            .from('users')
            .select('*')
            .eq('user_id', session.user.id)
            .single()
            .catch(() => ({ data: null }));
          
          if (!existingProfile) {
            // Create profile for OAuth users
            const { error: insertError } = await supabase
              .from('users')
              .insert([
                {
                  user_id: session.user.id,
                  name: session.user.user_metadata.name || 
                        session.user.email?.split('@')[0] || 
                        'User',
                  email: session.user.email,
                  onboarding_completed: false
                }
              ]);
            
            if (insertError) {
              console.error('Profile creation error:', insertError);
            }
          }
          
          // Store user data in localStorage
          const userProfile = existingProfile || { onboarding_completed: false };
          localStorage.setItem('user', JSON.stringify({
            user_id: session.user.id,
            name: session.user.user_metadata.name,
            email: session.user.email,
            onboarding_completed: userProfile.onboarding_completed
          }));
          
          // Redirect based on onboarding status
          if (userProfile.onboarding_completed) {
            navigate('/dashboard');
          } else {
            navigate('/onboarding');
          }
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        navigate('/login');
      }
    };

    handleAuthCallback();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        <p className="mt-4 text-lg font-medium">Completing authentication...</p>
        <p className="mt-2 text-sm text-gray-500">You will be redirected shortly</p>
      </div>
    </div>
  );
}