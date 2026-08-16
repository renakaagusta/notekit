import Link from 'next/link'
import type { FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import styles from './styles.module.css'

const plans = [
	{
		id: 'free',
		name: 'Free',
		price: null,
		priceNote: 'Forever free',
		description: 'Everything you need to get started with private, encrypted notes.',
		cta: 'Start for free',
		ctaHref: 'https://app.notekit.online',
		highlight: false,
		features: [
			'End-to-end encrypted notes',
			'Git-backed sync',
			'Up to 2 devices',
			'1 GB storage',
			'MCP agent access',
			'Web, desktop & mobile',
		],
	},
	{
		id: 'pro',
		name: 'Pro',
		price: 1.5,
		priceNote: 'per month',
		description: 'More devices and storage for people who write seriously.',
		cta: 'Get Pro',
		ctaHref: 'https://app.notekit.online',
		highlight: true,
		features: [
			'Everything in Free',
			'Up to 5 devices',
			'5 GB storage',
			'Priority sync',
			'Email support',
		],
	},
	{
		id: 'ultimate',
		name: 'Ultimate',
		price: 3,
		priceNote: 'per month',
		description: 'Maximum capacity for power users and heavy vaults.',
		cta: 'Get Ultimate',
		ctaHref: 'https://app.notekit.online',
		highlight: false,
		features: [
			'Everything in Pro',
			'Up to 10 devices',
			'15 GB storage',
			'Early access to new features',
			'Priority support',
		],
	},
]

const CheckIcon = () => (
	<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
		<polyline points='20 6 9 17 4 12' />
	</svg>
)

const Pricing: FC = () => {
	return (
		<section id='pricing' className={styles.pricing}>
			<LayoutWrapper>
				<div className={styles.heading__container}>
					<p className={styles.badge}>Pricing</p>
					<h2 className={styles.heading}>Simple, honest pricing</h2>
					<p className={styles.subheading}>
						No surprise fees. Cancel anytime. Your data is always yours — even on Free.
					</p>
				</div>

				<div className={styles.plans__grid}>
					{plans.map((plan) => (
						<div
							key={plan.id}
							className={`${styles.plan__card} ${plan.highlight ? styles.plan__card__highlight : ''}`}>
							{plan.highlight && (
								<span className={styles.popular__badge}>Most popular</span>
							)}

							<div className={styles.plan__header}>
								<span className={styles.plan__name}>{plan.name}</span>
								<div className={styles.plan__price__row}>
									{plan.price !== null ? (
										<>
											<span className={styles.plan__price__symbol}>$</span>
											<span className={styles.plan__price}>{plan.price}</span>
											<span className={styles.plan__price__note}>{plan.priceNote}</span>
										</>
									) : (
										<span className={styles.plan__price__free}>{plan.priceNote}</span>
									)}
								</div>
								<p className={styles.plan__description}>{plan.description}</p>
							</div>

							<Link href={plan.ctaHref} className={plan.highlight ? styles.cta__primary : styles.cta__secondary}>
								{plan.cta}
							</Link>

							<ul className={styles.feature__list}>
								{plan.features.map((feature) => (
									<li key={feature} className={styles.feature__item}>
										<span className={styles.feature__check}>
											<CheckIcon />
										</span>
										<span>{feature}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default Pricing
