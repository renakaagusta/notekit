'use client';
import { ArrowRight } from 'lucide-react';
import { AnimatePresence, type HTMLMotionProps, motion, type Transition } from 'motion/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

type InputButtonContextType = {
  showInput: boolean;
  setShowInput: React.Dispatch<React.SetStateAction<boolean>>;
  transition: Transition;
  id: string;
};

const InputButtonContext = React.createContext<InputButtonContextType | undefined>(undefined);

const useInputButton = (): InputButtonContextType => {
  const context = React.useContext(InputButtonContext);
  if (!context) throw new Error('useInputButton must be used within a InputButtonProvider');
  return context;
};

type InputButtonProviderProps = React.ComponentProps<'div'> & Partial<InputButtonContextType>;

function InputButtonProvider({
  className,
  transition = { type: 'spring', stiffness: 300, damping: 20 },
  showInput,
  setShowInput,
  id,
  children,
  ...props
}: InputButtonProviderProps) {
  const localId = React.useId();
  const [localShowInput, setLocalShowInput] = React.useState(false);

  return (
    <InputButtonContext.Provider
      value={{
        showInput: showInput ?? localShowInput,
        setShowInput: setShowInput ?? setLocalShowInput,
        transition,
        id: id ?? localId,
      }}
    >
      <div
        className={cn(
          'relative w-fit flex items-center justify-center h-12 mx-auto',
          (showInput || localShowInput) && 'w-full',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </InputButtonContext.Provider>
  );
}

type InputButtonProps = HTMLMotionProps<'div'>;

function InputButton({ className, ...props }: InputButtonProps) {
  return <motion.div className={cn('flex size-full', className)} {...props} />;
}

type InputButtonActionProps = HTMLMotionProps<'button'>;

function InputButtonAction({ className, ...props }: InputButtonActionProps) {
  const { transition, setShowInput, id } = useInputButton();
  return (
    <motion.button
      className={cn(
        'bg-white/10 text-sm whitespace-nowrap shrink-0 outline-none focus-visible:border-[#ea7317] focus-visible:ring-[#ea7317]/20 focus-visible:ring-4 rounded-xl border border-white/20 text-white hover:bg-white/15 hover:border-white/30 cursor-pointer pl-4 pr-12 size-full font-medium transition-all duration-200',
        className,
      )}
      layoutId={`input-button-action-${id}`}
      transition={transition}
      onClick={() => setShowInput((prev) => !prev)}
      {...props}
    />
  );
}

type InputButtonSubmitProps = HTMLMotionProps<'button'> & { icon?: React.ElementType };

function InputButtonSubmit({ className, children, icon: Icon = ArrowRight, onClick, ...props }: InputButtonSubmitProps) {
  const { transition, showInput, setShowInput, id } = useInputButton();
  return (
    <motion.button
      layoutId={`input-button-submit-${id}`}
      transition={transition}
      className={cn(
        "z-10 cursor-pointer shrink-0 outline-none focus-visible:border-[#ea7317] focus-visible:ring-[#ea7317]/20 focus-visible:ring-4 whitespace-nowrap bg-[#ea7317] hover:bg-[#d4660f] transition-all duration-200 text-white rounded-lg text-sm flex items-center justify-center font-medium absolute inset-y-2 right-2",
        showInput ? 'px-4' : 'aspect-square',
        className,
      )}
      onClick={(e) => { if (showInput && onClick) onClick(e); else setShowInput((prev) => !prev); }}
      {...props}
    >
      {showInput ? (
        <motion.span key="show-button" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
          {children}
        </motion.span>
      ) : (
        <motion.span key="show-icon" initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.2 }}>
          {React.createElement(Icon as React.ComponentType<{ className?: string }>, { className: 'size-4' })}
        </motion.span>
      )}
    </motion.button>
  );
}

type InputButtonInputProps = React.ComponentProps<'input'>;

function InputButtonInput({ className, ...props }: InputButtonInputProps) {
  const { transition, showInput, id } = useInputButton();
  return (
    <AnimatePresence>
      {showInput && (
        <div className="absolute inset-0 size-full flex items-center justify-center">
          <motion.div
            layoutId={`input-button-input-${id}`}
            className="size-full flex items-center bg-white/10 rounded-xl relative border border-white/20"
            transition={transition}
          >
            <input
              className={cn(
                'size-full selection:bg-[#ea7317] selection:text-white placeholder:text-white/40 inset-0 pl-4 border-0 pr-20 py-3 text-sm bg-transparent rounded-xl focus:outline-none absolute shrink-0 text-white',
                className,
              )}
              {...props}
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export {
  InputButton,
  InputButtonProvider,
  InputButtonAction,
  InputButtonSubmit,
  InputButtonInput,
  useInputButton,
};
