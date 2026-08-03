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
							<div className={styles.hero__illustration__base}>
								<div className={styles.hero__illustration__sidebar}>
									<div className={styles.sidebar__logo}>
										<svg viewBox='0 0 32 32' width='20' height='20'>
											<line
												x1='10.5'
												y1='26'
												x2='21.5'
												y2='6'
												stroke='white'
												strokeWidth='6.5'
												strokeLinecap='round'
											/>
										</svg>
										<span>My Vault</span>
									</div>
									<div className={styles.sidebar__section}>
										<div className={styles.sidebar__label}>Notes</div>
										<div className={styles.sidebar__item__active}>Weekly Review</div>
										<div className={styles.sidebar__item}>Project Ideas</div>
										<div className={styles.sidebar__item}>Research</div>
									</div>
									<div className={styles.sidebar__section}>
										<div className={styles.sidebar__label}>Surfaces</div>
										<div className={styles.sidebar__item}>🔒 Secrets</div>
										<div className={styles.sidebar__item}>🔗 Links</div>
										<div className={styles.sidebar__item}>📅 Calendar</div>
									</div>
								</div>
								<div className={styles.hero__illustration__main}>
									<div className={styles.note__header}>
										<span className={styles.note__title}>Weekly Review</span>
										<span className={styles.note__badge}>🔐 E2EE</span>
									</div>
									<div className={styles.note__body}>
										<div className={styles.note__h1}>This week&apos;s goals</div>
										<div className={styles.note__p}>Ship the landing page, review open PRs, plan sprint.</div>
										<div className={styles.note__h2}>Notes</div>
										<div className={styles.note__p}>All content encrypted with your device key before syncing.</div>
										<div className={styles.note__code}>age encrypt -r pubkey note.md</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default Hero
