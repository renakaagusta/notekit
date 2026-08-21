import type { FC, ReactNode } from 'react'
import styles from './styles.module.css'

export interface FeatureLookupProps {
	id: string
	title: string
	description: string
	icon: ReactNode
}

const BentoGridFeatureLookUpCard: FC<FeatureLookupProps> = ({
	icon,
	description,
	title,
}) => {
	return (
		<div className={styles.bento__grid__feature__lookup__card}>
			<div className={styles.title__container}>
				{icon}
				<h4> {title} </h4>
			</div>

			<span className={styles.description}> {description} </span>
		</div>
	)
}

export default BentoGridFeatureLookUpCard
