import type { FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import SectionHeading from '@/components/sectionHeading'
import { foundationList } from '@/lib/constant'
import styles from './styles.module.css'

const Privacy: FC = () => {
	return (
		<section className={styles.foundation}>
			<LayoutWrapper>
				<div className={styles.inner__container}>
					<div className={styles.heading__container}>
						<SectionHeading
							badgeText='Privacy by design'
							heading='Cryptography, not promises'
						/>

						<p>
							NoteKit&apos;s security is built on open, auditable primitives —
							not proprietary encryption or trust-me-bro policies. Your notes
							are safe even if our servers are compromised.
						</p>
					</div>

					<div className={styles.list__container}>
						<div className={styles.seperator} />

						<dl className={styles.list}>
							{foundationList.map(({ id, label, value }) => (
								<div key={id} className={styles.list__item}>
									<dt className={styles.item__label}>{label}</dt>
									<dd className={styles.item__value}>{value}</dd>
								</div>
							))}
						</dl>
					</div>

					<div className={styles.feature__list__container}>
						<div className={styles.seperator} />
						<div className={styles.feature__list}>
							<FeatureCard title='Open source clients'>
								<KeyIcon />
							</FeatureCard>
							<FeatureCard title='AGPL server'>
								<ShieldIcon />
							</FeatureCard>
							<FeatureCard title='BIP39 recovery'>
								<PhraseIcon />
							</FeatureCard>
							<FeatureCard title='Reproducible builds'>
								<BuildIcon />
							</FeatureCard>
						</div>
					</div>
				</div>
			</LayoutWrapper>
		</section>
	)
}

const FeatureCard: FC<{ title: string; children: React.ReactNode }> = ({
	title,
	children,
}) => (
	<div className={styles.feature__card}>
		{children}
		<span className={styles.feature__card__title}>{title}</span>
	</div>
)

const KeyIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
		<path d='M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4' />
	</svg>
)

const ShieldIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
		<path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
	</svg>
)

const PhraseIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
		<rect x='3' y='3' width='18' height='18' rx='2' />
		<path d='M3 9h18M9 21V9' />
	</svg>
)

const BuildIcon = () => (
	<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.5' strokeLinecap='round'>
		<polyline points='16 18 22 12 16 6' />
		<polyline points='8 6 2 12 8 18' />
	</svg>
)

export default Privacy
