import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'
import BlurPopUpByWord from '@/components/blur-pop-up-by-words'
import { cn } from '@/lib/utils'
import BlurPopUp from '@/components/blur-pop-up'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const Hero: FC = () => {
	return (
		<section className={styles.hero}>
			<LayoutWrapper>
				<h1 className={cn(styles.heading, styles.hide__mobile)}>
					<BlurPopUpByWord text='Your private second brain.' />
				</h1>

				<h1 className={cn(styles.heading, styles.show__mobile, 'text-center')}>
					<BlurPopUpByWord text='Your private second brain.' />
				</h1>

				<BlurPopUp delay={1}>
					<h2 className={cn(styles.sub__heading, styles.hide__mobile)}>
						E2E encrypted, Git-backed, and agent-ready. Own your notes — forever.
					</h2>
					<h2 className={cn(styles.sub__heading, styles.show__mobile)}>
						End-to-end encrypted notes that sync via Git and work with AI agents.
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
