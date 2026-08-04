import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'
import BlurPopUpByWord from '@/components/blur-pop-up-by-words'
import { cn } from '@/lib/utils'
import BlurPopUp from '@/components/blur-pop-up'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const EyeIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<path d='M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z' />
		<circle cx='12' cy='12' r='3' />
	</svg>
)

const CodeIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<polyline points='16 18 22 12 16 6' />
		<polyline points='8 6 2 12 8 18' />
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
					<BlurPopUpByWord text='Notes only you can read.' />
				</h1>

				<h1 className={cn(styles.heading, styles.show__mobile, 'text-center')}>
					<BlurPopUpByWord text='Notes only you can read.' />
				</h1>

				<BlurPopUp delay={1}>
					<h2 className={cn(styles.sub__heading, styles.hide__mobile)}>
						A note-taking app that doesn&apos;t ask you to trust us.
						You can see where your notes are stored, how they&apos;re protected,
						and run the whole thing yourself if you want.
					</h2>
					<h2 className={cn(styles.sub__heading, styles.show__mobile)}>
						A note-taking app that doesn&apos;t ask you to trust us. Fully open, fully yours.
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
							<EyeIcon />
							See exactly where your notes are stored
						</span>
						<span className={styles.trust__pill}>
							<CodeIcon />
							Verify the encryption yourself — it&apos;s open source
						</span>
						<span className={styles.trust__pill}>
							<ServerIcon />
							Self-host the whole stack if you prefer
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
