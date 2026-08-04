import { type FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import styles from './styles.module.css'

const platforms = [
	{
		id: 'web',
		title: 'Web',
		subtitle: 'Any browser, fully E2EE',
		icons: [<ChromeIcon key='chrome' />, <SafariIcon key='safari' />, <BraveIcon key='brave' />],
	},
	{
		id: 'desktop',
		title: 'Desktop',
		subtitle: 'Native offline app',
		icons: [<MacOSIcon key='macos' />, <WindowsIcon key='windows' />],
	},
	{
		id: 'mobile',
		title: 'Mobile',
		subtitle: 'iOS, iPadOS & Android',
		icons: [<IOSIcon key='ios' />, <IPadOSIcon key='ipados' />, <AndroidIcon key='android' />],
	},
	{
		id: 'cli',
		title: 'CLI',
		subtitle: 'Headless access for agents & scripts',
		icons: [<TerminalIcon key='cli' />],
	},
]

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
								<div className={styles.icon__group}>
									{platform.icons.map((icon) => icon)}
								</div>
							</div>
							<div className={styles.card__text}>
								<span className={styles.device__title}>{platform.title}</span>
								<span className={styles.device__subtitle}>{platform.subtitle}</span>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

function ChromeIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M12 0C8.21 0 4.831 1.757 2.632 4.501l3.953 6.848A5.454 5.454 0 0 1 12 6.545h10.691A12 12 0 0 0 12 0zM1.931 5.47A11.943 11.943 0 0 0 0 12c0 6.012 4.42 10.991 10.189 11.864l3.953-6.847a5.45 5.45 0 0 1-6.865-2.29zm13.342 2.166a5.446 5.446 0 0 1 1.45 7.09l.002.001h-.002l-5.344 9.257c.206.01.413.016.621.016 6.627 0 12-5.373 12-12 0-1.54-.29-3.011-.818-4.364zM12 10.545a1.455 1.455 0 1 0 0 2.91 1.455 1.455 0 0 0 0-2.91zm0-2.727a4.182 4.182 0 1 1 0 8.364 4.182 4.182 0 0 1 0-8.364z' />
			</svg>
			<span>Chrome</span>
		</div>
	)
}

function SafariIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M12 24C5.373 24 0 18.627 0 12S5.373 0 12 0s12 5.373 12 12-5.373 12-12 12zm0-1.453c5.86 0 10.547-4.686 10.547-10.547S17.86 1.453 12 1.453 1.453 6.14 1.453 12 6.14 22.547 12 22.547zm4.845-15.758l-5.756 3.584L7.5 16.16l5.756-3.584 3.59-5.787zm-4.872 5.793a.968.968 0 1 1 .054-1.935.968.968 0 0 1-.054 1.935z' />
			</svg>
			<span>Safari</span>
		</div>
	)
}

function BraveIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M19.98 6.655l.935-2.618L19.188 3l-1.462 1.065a10.452 10.452 0 0 1-1.43-.608L15.116 2H8.884l-.18 1.457a10.452 10.452 0 0 1-1.43.608L5.812 3 4.085 4.037l.935 2.618-.748 1.056L4 8.82l.38 1.402 1.286.924-.36 1.488.905 1.186 1.442.358.437.924A7.734 7.734 0 0 0 12 17.46a7.734 7.734 0 0 0 3.91-2.358l.437-.924 1.442-.358.905-1.186-.36-1.488 1.286-.924L20 8.82l-.272-1.109-.748-1.056zm-7.98 9.056a5.984 5.984 0 0 1-4.394-1.93l-.194-.409-1.219-.302-.51-.668.39-1.609-1.286-.924-.245-1.062.566-.796L4.83 6.44l-.416-1.165.716-.421 1.462 1.065.553-.2A11.98 11.98 0 0 0 8.79 5.11L8.957 3.74h6.086l.167 1.371a11.98 11.98 0 0 0 1.645.608l.553.2 1.462-1.065.716.421-.416 1.165-.276 3.571.566.796-.245 1.062-1.286.924.39 1.609-.51.668-1.219.302-.194.409A5.984 5.984 0 0 1 12 15.711z' />
			</svg>
			<span>Brave</span>
		</div>
	)
}

function MacOSIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701' />
			</svg>
			<span>macOS</span>
		</div>
	)
}

function WindowsIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.551H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801' />
			</svg>
			<span>Windows</span>
		</div>
	)
}

function IOSIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z' />
			</svg>
			<span>iOS</span>
		</div>
	)
}

function IPadOSIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<rect x='3' y='2' width='18' height='20' rx='2' />
				<circle cx='12' cy='18' r='1' fill='currentColor' stroke='none' />
				<line x1='8' y1='6' x2='16' y2='6' />
			</svg>
			<span>iPadOS</span>
		</div>
	)
}

function AndroidIcon() {
	return (
		<div className={styles.platform__icon}>
			<svg viewBox='0 0 24 24' fill='currentColor'>
				<path d='M17.523 15.341a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m-11.046 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1m11.405-6.02l1.997-3.46a.414.414 0 0 0-.15-.567.414.414 0 0 0-.566.15l-2.023 3.505A11.927 11.927 0 0 0 12 8.25c-1.68 0-3.27.346-4.705.96L5.272 5.443a.413.413 0 0 0-.566-.15.413.413 0 0 0-.15.567l1.997 3.46C3.68 10.776 1.94 13.18 1.5 16h21c-.44-2.82-2.18-5.224-4.618-6.679' />
			</svg>
			<span>Android</span>
		</div>
	)
}

function TerminalIcon() {
	return (
		<div className={`${styles.platform__icon} ${styles.platform__icon__large}`}>
			<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round' strokeLinejoin='round'>
				<polyline points='4 17 10 11 4 5' />
				<line x1='12' y1='19' x2='20' y2='19' />
			</svg>
			<span>CLI</span>
		</div>
	)
}

export default Devices
