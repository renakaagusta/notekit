import { type FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import styles from './styles.module.css'

const platforms = [
	{
		id: 'card-1',
		title: 'Web — notes in your browser, fully E2EE',
		visual: <WebVisual />,
	},
	{
		id: 'card-2',
		title: 'Desktop — offline Electron app with native feel',
		visual: <DesktopVisual />,
	},
	{
		id: 'card-3',
		title: 'Mobile — iOS & Android, Obsidian-style drawer',
		visual: <MobileVisual />,
	},
	{
		id: 'card-4',
		title: 'CLI — headless access for agents & scripts',
		visual: <CLIVisual />,
	},
]

function WebVisual() {
	return (
		<div className={styles.visual__web}>
			<div className={styles.browser__bar}>
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.browser__url}>app.notekit.online</span>
			</div>
			<div className={styles.browser__body}>
				<div className={styles.mini__sidebar}>
					<div className={styles.mini__logo}>
						<svg viewBox='0 0 32 32' width='14' height='14'>
							<line x1='10.5' y1='26' x2='21.5' y2='6' stroke='white' strokeWidth='6.5' strokeLinecap='round' />
						</svg>
					</div>
					{['Notes', 'Tickets', 'Links', 'Secrets'].map((item) => (
						<div key={item} className={styles.mini__nav__item}>{item}</div>
					))}
				</div>
				<div className={styles.mini__editor}>
					<div className={styles.mini__title} />
					<div className={styles.mini__line} style={{ width: '80%' }} />
					<div className={styles.mini__line} style={{ width: '60%' }} />
					<div className={styles.mini__line} style={{ width: '70%' }} />
					<div className={styles.mini__line__short} style={{ width: '40%' }} />
					<div className={styles.mini__line} style={{ width: '65%' }} />
				</div>
			</div>
		</div>
	)
}

function DesktopVisual() {
	return (
		<div className={styles.visual__desktop}>
			<div className={styles.desktop__titlebar}>
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.desktop__title}>NoteKit</span>
			</div>
			<div className={styles.browser__body}>
				<div className={styles.mini__sidebar}>
					<div className={styles.mini__logo}>
						<svg viewBox='0 0 32 32' width='14' height='14'>
							<line x1='10.5' y1='26' x2='21.5' y2='6' stroke='white' strokeWidth='6.5' strokeLinecap='round' />
						</svg>
					</div>
					{['Notes', 'Tickets', 'Links', 'Secrets'].map((item) => (
						<div key={item} className={styles.mini__nav__item}>{item}</div>
					))}
				</div>
				<div className={styles.mini__editor}>
					<div className={styles.mini__title} />
					<div className={styles.mini__line} style={{ width: '75%' }} />
					<div className={styles.mini__line} style={{ width: '55%' }} />
					<div className={styles.mini__code__block}>
						<div className={styles.mini__code__line} style={{ width: '60%' }} />
						<div className={styles.mini__code__line} style={{ width: '40%' }} />
					</div>
					<div className={styles.mini__line} style={{ width: '65%' }} />
				</div>
			</div>
		</div>
	)
}

function MobileVisual() {
	return (
		<div className={styles.visual__mobile}>
			<div className={styles.phone__notch} />
			<div className={styles.phone__header}>
				<svg viewBox='0 0 32 32' width='16' height='16'>
					<line x1='10.5' y1='26' x2='21.5' y2='6' stroke='white' strokeWidth='6.5' strokeLinecap='round' />
				</svg>
				<span className={styles.phone__vault}>My Vault</span>
			</div>
			<div className={styles.phone__list}>
				{['Weekly Review', 'Project Ideas', 'Meeting Notes', 'Research'].map((note) => (
					<div key={note} className={styles.phone__note__item}>
						<div className={styles.phone__note__icon} />
						<div className={styles.phone__note__text}>
							<div className={styles.phone__note__title}>{note}</div>
							<div className={styles.phone__note__meta} />
						</div>
					</div>
				))}
			</div>
			<div className={styles.phone__toolbar}>
				<div className={styles.phone__toolbar__btn} />
				<div className={styles.phone__toolbar__btn} />
				<div className={styles.phone__toolbar__btn} />
				<div className={styles.phone__new__btn}>+</div>
			</div>
		</div>
	)
}

function CLIVisual() {
	return (
		<div className={styles.visual__cli}>
			<div className={styles.terminal__bar}>
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.browser__dot} />
				<span className={styles.terminal__title}>zsh</span>
			</div>
			<div className={styles.terminal__body}>
				<div className={styles.terminal__line}>
					<span className={styles.terminal__prompt}>$</span>
					<span className={styles.terminal__cmd}> notekit ls</span>
				</div>
				<div className={styles.terminal__output}>Weekly Review.md</div>
				<div className={styles.terminal__output}>Project Ideas.md</div>
				<div className={styles.terminal__output}>Research.md</div>
				<div className={styles.terminal__line}>
					<span className={styles.terminal__prompt}>$</span>
					<span className={styles.terminal__cmd}> notekit read "Weekly Review.md"</span>
				</div>
				<div className={styles.terminal__output}>Decrypting... ✓</div>
				<div className={styles.terminal__line__cursor}>
					<span className={styles.terminal__prompt}>$</span>
					<span className={styles.terminal__cursor}>█</span>
				</div>
			</div>
		</div>
	)
}

const Devices: FC = () => {
	return (
		<section className={styles.modern__product__teams}>
			<LayoutWrapper>
				<div className={styles.top__container}>
					<div className={styles.heading}>
						<h2>One vault, every device</h2>
					</div>

					<div className={styles.description}>
						<p>
							Your encrypted notes follow you everywhere — web, desktop, mobile,
							and CLI. One key, all surfaces, zero compromises.
						</p>
					</div>
				</div>
			</LayoutWrapper>

			<div className={styles.carousel__container}>
				<div className={styles.carousel__inner}>
					{platforms.map((platform) => (
						<div key={platform.id} className={styles.device__card}>
							<div className={styles.device__visual}>
								{platform.visual}
							</div>
							<span className={styles.device__title}>{platform.title}</span>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

export default Devices
