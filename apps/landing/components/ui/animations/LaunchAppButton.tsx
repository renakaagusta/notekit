'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { forwardRef } from 'react';

interface LaunchAppButtonProps {
  href?: string;
  onClick?: () => void;
  className?: string;
  text?: string;
}

const LaunchAppButton = forwardRef<HTMLDivElement, LaunchAppButtonProps>(
  ({ href, onClick, className = '', text = 'Launch App' }, ref) => {
    const handleMouseEnter = (e: React.MouseEvent) => {
      const leftPath = e.currentTarget.querySelector('.left-path') as SVGPathElement;
      const rightPath = e.currentTarget.querySelector('.right-path') as SVGPathElement;
      const arrow = e.currentTarget.querySelector('.arrow') as HTMLElement;

      if (leftPath) {
        leftPath.style.fill = '#CD6529';
        leftPath.setAttribute('d', 'M0 12C0 5.37258 5.37258 0 12 0H196.047C200.868 0 205.22 2.88468 207.099 7.32432L218.945 35.3243C222.292 43.2364 216.484 52 207.893 52H12C5.37259 52 0 46.6274 0 40V12Z');
      }
      if (rightPath) {
        rightPath.style.fill = '#414345';
        rightPath.setAttribute('d', 'M7.03916 16.8541C3.53021 8.92079 9.33893 0 18.0136 0H57.5845C64.2119 0 69.5845 5.37258 69.5845 12V40C69.5845 46.6274 64.2119 52 57.5845 52H30.3982C25.6482 52 21.3452 49.1981 19.4238 44.8541L7.03916 16.8541Z');
      }
      if (arrow) arrow.style.transform = 'translateX(8px)';
    };

    const handleMouseLeave = (e: React.MouseEvent) => {
      const leftPath = e.currentTarget.querySelector('.left-path') as SVGPathElement;
      const rightPath = e.currentTarget.querySelector('.right-path') as SVGPathElement;
      const arrow = e.currentTarget.querySelector('.arrow') as HTMLElement;

      if (leftPath) {
        leftPath.style.fill = '#414345';
        leftPath.setAttribute('d', 'M0 12C0 5.37258 5.37258 0 12 0H207.893C216.484 0 222.292 8.76365 218.945 16.6757L207.099 44.6757C205.22 49.1153 200.868 52 196.047 52H12C5.37258 52 0 46.6274 0 40V12Z');
      }
      if (rightPath) {
        rightPath.style.fill = '#CD6529';
        rightPath.setAttribute('d', 'M19.8393 7.14592C21.7607 2.80185 26.0637 0 30.8137 0H58C64.6274 0 70 5.37258 70 12V40C70 46.6274 64.6274 52 58 52H18.4291C9.75445 52 3.94574 43.0792 7.45469 35.1459L19.8393 7.14592Z');
      }
      if (arrow) arrow.style.transform = 'translateX(4px)';
    };

    const handleClick = () => {
      if (onClick) onClick();
    };

    return (
      <div
        ref={ref}
        className={`flex items-center cursor-pointer ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Gray trapezoid section with SVG background */}
        <div className="relative">
          <svg
            className="left-svg"
            width="226"
            height="52"
            viewBox="0 0 226 52"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="left-path"
              d="M0 12C0 5.37258 5.37258 0 12 0H207.893C216.484 0 222.292 8.76365 218.945 16.6757L207.099 44.6757C205.22 49.1153 200.868 52 196.047 52H12C5.37258 52 0 46.6274 0 40V12Z"
              fill="#414345"
              style={{
                fill: '#414345',
                transition: 'fill 0.5s ease, d 0.5s ease'
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-lg font-extralight">{text}</span>
          </div>
        </div>

        {/* Orange trapezoid section with SVG background */}
        {href ? (
          <Link href={href} className="relative -ml-2">
            <svg
              className="right-svg"
              width="70"
              height="52"
              viewBox="0 0 70 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className="right-path"
                d="M19.8393 7.14592C21.7607 2.80185 26.0637 0 30.8137 0H58C64.6274 0 70 5.37258 70 12V40C70 46.6274 64.6274 52 58 52H18.4291C9.75445 52 3.94574 43.0792 7.45469 35.1459L19.8393 7.14592Z"
                fill="#CD6529"
                style={{
                  fill: '#CD6529',
                  transition: 'fill 0.5s ease, d 0.5s ease'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <ArrowRight
                className="w-5 h-5 text-white arrow"
                style={{
                  transform: 'translateX(4px)',
                  transition: 'transform 0.3s ease'
                }}
              />
            </div>
          </Link>
        ) : (
          <div className="relative -ml-2 cursor-not-allowed opacity-50">
            <svg
              className="right-svg"
              width="70"
              height="52"
              viewBox="0 0 70 52"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                className="right-path"
                d="M19.8393 7.14592C21.7607 2.80185 26.0637 0 30.8137 0H58C64.6274 0 70 5.37258 70 12V40C70 46.6274 64.6274 52 58 52H18.4291C9.75445 52 3.94574 43.0792 7.45469 35.1459L19.8393 7.14592Z"
                fill="#CD6529"
                style={{
                  fill: '#CD6529',
                  transition: 'fill 0.5s ease, d 0.5s ease'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <ArrowRight
                className="w-5 h-5 text-white arrow"
                style={{
                  transform: 'translateX(4px)',
                  transition: 'transform 0.3s ease'
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }
);

LaunchAppButton.displayName = 'LaunchAppButton';

export default LaunchAppButton;