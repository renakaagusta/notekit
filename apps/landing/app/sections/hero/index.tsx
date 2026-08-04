import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'
import BlurPopUpByWord from '@/components/blur-pop-up-by-words'
import { cn } from '@/lib/utils'
import BlurPopUp from '@/components/blur-pop-up'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const ShieldIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
	</svg>
)

const PlatformIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<rect x='2' y='3' width='20' height='14' rx='2' />
		<path d='M8 21h8M12 17v4' />
	</svg>
)

const LogIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22' />
	</svg>
)

const ServerIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<rect x='2' y='2' width='20' height='8' rx='2' />
		<rect x='2' y='14' width='20' height='8' rx='2' />
		<line x1='6' y1='6' x2='6.01' y2='6' />
		<line x1='6' y1='18' x2='6.01' y2='18' />
	</svg>
)

const Hero: FC = () => {
	return (
		<section className={styles.hero}>
			<LayoutWrapper>
				<h1 className={cn(styles.heading, styles.hide__mobile)}>
					<BlurPopUpByWord text='A second brain you actually own.' />
				</h1>

				<h1 className={cn(styles.heading, styles.show__mobile, 'text-center')}>
					<BlurPopUpByWord text='A second brain you actually own.' />
				</h1>

				<BlurPopUp delay={1}>
					<h2 className={cn(styles.sub__heading, styles.hide__mobile)}>
						Encrypted on your device. Synced via Git. Available on every platform.
						Every change is logged. Every note is always yours.
					</h2>
					<h2 className={cn(styles.sub__heading, styles.show__mobile)}>
						Encrypted on your device. Synced via Git. Available everywhere. Fully yours.
					</h2>
				</BlurPopUp>

				<div className={cn(styles.button__container)}>
					<BlurPopUp delay={1.1}>
						<Link
							className={styles.start__link}
							href='https://app.notekit.online'>
							Start for free
						</Link>
					</BlurPopUp>

					<BlurPopUp delay={1.15}>
						<Link
							className={styles.secondary__link}
							href='https://github.com/notekit-io/notekit'>
							<span>View on GitHub</span>
							<ChevronRight />
						</Link>
					</BlurPopUp>
				</div>

				<BlurPopUp delay={1.3}>
					<div className={styles.trust__pills}>
						<span className={styles.trust__pill}>
							<ShieldIcon />
							Encrypted before it leaves your device
						</span>
						<span className={styles.trust__pill}>
							<PlatformIcon />
							Web, desktop, mobile &amp; CLI
						</span>
						<span className={styles.trust__pill}>
							<LogIcon />
							Full audit log — every change is a commit
						</span>
						<span className={styles.trust__pill}>
							<ServerIcon />
							Self-host or bring your own Git
						</span>
					</div>
				</BlurPopUp>

				<div className={styles.hero__img__container}>
					<div className={styles.hero__illustration__container}>
						<div className={styles.hero__illustration__perspective}>
							<img
								src='/app-screenshot.png'
								alt='NoteKit app — note editor with sidebar and backlinks panel'
								className={styles.hero__screenshot}
								draggable={false}
							/>
						</div>
					</div>
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default Hero
