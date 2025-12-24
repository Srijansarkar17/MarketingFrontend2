// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface User {
  user_id: string;
  name: string;
  email: string;
  onboarding_completed: boolean;
  business_type?: string;
  industry?: string;
  goals?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (name: string, email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  completeOnboarding: (businessType: string, industry: string, goals: string) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  console.error('VITE_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.error('VITE_SUPABASE_KEY:', supabaseKey ? 'Set' : 'Missing');
}

const supabase: SupabaseClient = createClient(supabaseUrl || '', supabaseKey || '');

// Password hashing function using SHA-256
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
    setIsLoading(false);
  }, []);

  const signup = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // Validation
      if (!name || !email || !password || !confirmPassword) {
        return { success: false, error: 'Fill all the details before proceeding' };
      }

      if (password !== confirmPassword) {
        return { success: false, error: 'Passwords do not match' };
      }

      if (password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters long' };
      }

      const emailLower = email.toLowerCase().trim();

      // Check if user already exists in Supabase
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('email', emailLower)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking existing user:', checkError);
        return { success: false, error: 'Failed to verify email. Please try again.' };
      }

      if (existingUser) {
        return { success: false, error: 'Email already exists' };
      }

      // Hash the password
      const hashedPassword = await hashPassword(password);

      // Insert new user into Supabase
      const { data: newUserData, error: insertError } = await supabase
        .from('users')
        .insert({
          name: name,
          email: emailLower,
          password_hash: hashedPassword,
          onboarding_completed: false,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Supabase insert error:', insertError);
        return { success: false, error: 'Failed to create account. Please try again.' };
      }

      if (!newUserData) {
        return { success: false, error: 'Failed to create account. Please try again.' };
      }

      // Create user object
      const newUser: User = {
        user_id: newUserData.user_id,
        name: newUserData.name,
        email: newUserData.email,
        onboarding_completed: false,
      };

      // Set current user
      localStorage.setItem('user', JSON.stringify(newUser));
      localStorage.setItem('token', `token_${newUser.user_id}`);
      setUser(newUser);

      return { success: true };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An error occurred during signup. Please check your connection.' };
    }
  };

  const login = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!email || !password) {
        return { success: false, error: 'Email and password are required' };
      }

      const emailLower = email.toLowerCase().trim();

      // Get user from Supabase
      const { data: userData, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', emailLower)
        .maybeSingle();

      if (fetchError) {
        console.error('Supabase fetch error:', fetchError);
        return { success: false, error: 'Failed to login. Please try again.' };
      }

      if (!userData) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Check if account is active
      if (userData.is_active === false) {
        return { success: false, error: 'Account has been deactivated' };
      }

      // Verify password
      const hashedPassword = await hashPassword(password);
      if (userData.password_hash !== hashedPassword) {
        return { success: false, error: 'Invalid email or password' };
      }

      // Update last_login timestamp
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', userData.user_id);

      // Create user object
      const loggedInUser: User = {
        user_id: userData.user_id,
        name: userData.name,
        email: userData.email,
        onboarding_completed: userData.onboarding_completed || false,
        business_type: userData.business_type,
        industry: userData.industry,
        goals: userData.goals,
      };

      // Set current user
      localStorage.setItem('user', JSON.stringify(loggedInUser));
      localStorage.setItem('token', `token_${loggedInUser.user_id}`);
      setUser(loggedInUser);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login. Please check your connection.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
  };

  const completeOnboarding = async (
    businessType: string,
    industry: string,
    goals: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }

      if (!businessType || !industry || !goals) {
        return { success: false, error: 'All onboarding questions must be answered' };
      }

      // Update user in Supabase
      const { data: updatedData, error: updateError } = await supabase
        .from('users')
        .update({
          business_type: businessType,
          industry: industry,
          goals: goals,
          onboarding_completed: true,
        })
        .eq('user_id', user.user_id)
        .select()
        .single();

      if (updateError) {
        console.error('Supabase update error:', updateError);
        return { success: false, error: 'Failed to update profile. Please try again.' };
      }

      if (!updatedData) {
        return { success: false, error: 'Failed to update profile. Please try again.' };
      }

      // Update user object
      const updatedUser: User = {
        ...user,
        business_type: updatedData.business_type,
        industry: updatedData.industry,
        goals: updatedData.goals,
        onboarding_completed: true,
      };

      // Update current user
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);

      return { success: true };
    } catch (error) {
      console.error('Complete onboarding error:', error);
      return { success: false, error: 'An error occurred during onboarding. Please check your connection.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, completeOnboarding, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};