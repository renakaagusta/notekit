import { type FC } from 'react'
import LayoutWrapper from '@/components/layout-wrapper'
import styles from './styles.module.css'
import { modernProductCards } from '@/lib/constant'

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
					{modernProductCards.map((card) => (
						<div key={card.id} className={styles.device__card}>
							<div className={styles.device__placeholder} />
							<span className={styles.device__title}>{card.title}</span>
						</div>
					))}
				</div>
			</div>
		</section>
	)
}

export default Devices
