'use client';

import { MeshGradient } from '@paper-design/shaders-react';
import { AlertCircle, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
  InputButtonAction,
  InputButtonInput,
  InputButtonProvider,
  InputButtonSubmit,
} from '@/components/ui/shadcn-io/input-button';

// Constants
const MESH_GRADIENT_COLORS = ['#1a1a1a', '#2d2d2d', '#404040', '#525252', '#0a0a0a', '#000000'];
const EXISTING_EMAILS = ['test@example.com', 'user@demo.com'];

export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleSubmit = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (EXISTING_EMAILS.includes(email.toLowerCase())) {
      setError('This email is already on our waitlist');
      setIsLoading(false);
      return;
    }

    setIsSubmitted(true);
    setIsLoading(false);

    setTimeout(() => {
      setEmail('');
      setIsSubmitted(false);
    }, 4000);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* MeshGradient Background */}
      <div className="absolute inset-0">
        <MeshGradient
          width={dimensions.width}
          height={dimensions.height}
          colors={MESH_GRADIENT_COLORS}
          distortion={0.8}
          swirl={0.6}
          grainMixer={0}
          grainOverlay={0}
          speed={0.42}
          offsetX={0.08}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-xl"
        >
          {/* Single Unified Card */}
          <div className="relative">
            <div className="absolute inset-0 bg-white/60 backdrop-blur-xl rounded-3xl border border-white/10" />
            <div className="relative p-8 md:p-10 space-y-8">
              {/* Header Section */}
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="inline-flex items-center justify-center gap-3"
                >
                  <Image
                    src="/images/logo/ScaleX.webp"
                    alt="ScaleX Logo"
                    width={120}
                    height={40}
                    className="h-10 w-auto"
                    priority
                  />
                  <span className="text-xl font-bold text-slate-800">ScaleX</span>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="space-y-4"
                >
                  <h1 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight">
                    Start Earning Yield
                    <span className="block text-slate-900">While Trading</span>
                  </h1>
                  <p className="text-lg text-slate-700 max-w-md mx-auto leading-relaxed">
                    Stop Leaving Capital Idle.
                    <span className="block">Join Yield Bearing CLOB.</span>
                  </p>
                </motion.div>
              </div>

              {/* Form Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="space-y-6"
              >
                <div className="space-y-3">
                  {/* Input Button Component */}
                  <InputButtonProvider>
                    <InputButtonAction>Join to Waitlist</InputButtonAction>

                    <InputButtonInput
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      placeholder="your@email.com"
                    />

                    <InputButtonSubmit
                      onClick={handleSubmit}
                      disabled={isSubmitted || isLoading}
                      className={
                        isSubmitted
                          ? 'bg-green-500 hover:bg-green-600'
                          : isLoading
                            ? 'bg-slate-400 cursor-not-allowed'
                            : ''
                      }
                    >
                      {isSubmitted ? 'Subscribed!' : isLoading ? '...' : 'Subscribe'}
                    </InputButtonSubmit>
                  </InputButtonProvider>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-2 text-red-600 text-sm"
                      >
                        <AlertCircle className="w-4 h-4" />
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Success Message */}
                <AnimatePresence>
                  {isSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-center"
                    >
                      <div className="inline-flex items-center gap-3 px-6 py-3 bg-green-100 rounded-full border border-green-300">
                        <Check className="w-5 h-5 text-green-600" />
                        <span className="text-green-800 font-medium">
                          Successfully subscribed! We&apos;ll be in touch soon.
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Docs Section */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  className="pt-6 border-t border-slate-300"
                >
                  <p className="text-center text-sm text-slate-600 mb-4">Learn more about our protocol</p>
                  <div className="flex items-center justify-center">
                    <motion.a
                      href="https://docs.scalex.money/genesis-story"
                      target="_blank"
                      rel="noopener noreferrer"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg border border-slate-900 transition-all duration-200"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <title>Documentation icon</title>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                        />
                      </svg>
                      <span className="text-sm font-medium">Read Our Docs</span>
                    </motion.a>
                  </div>
                </motion.div>

                {/* Social Media Section - Commented Out */}
                {/* <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                  className="pt-6 border-t border-slate-300"
                >
                  <p className="text-center text-sm text-slate-600 mb-4">
                    Join our community
                  </p>
                  <div className="flex items-center justify-center gap-4">
                    <motion.a
                      href="#"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg border border-[#5865F2] transition-all duration-200"
                    >
                      <DiscordIcon />
                      <span className="text-sm font-medium">Discord</span>
                    </motion.a>
                    <motion.a
                      href="#"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg border border-slate-800 transition-all duration-200"
                    >
                      <XIcon />
                      <span className="text-sm font-medium">Follow Us</span>
                    </motion.a>
                  </div>
                </motion.div> */}

                {/* Footer */}
                <p className="text-center text-xs text-slate-500 pt-4">
                  By joining, you agree to receive updates about ScaleX.
                  <br />
                  You can unsubscribe anytime.
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}