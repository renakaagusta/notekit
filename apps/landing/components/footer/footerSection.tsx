import { type FC } from 'react'
import Link from 'next/link'
import { type FooterSection } from '@/lib/constant'
import styles from './styles.module.css'

const FooterSectionComponent: FC<FooterSection> = ({ title, items }) => {
	return (
		<div className={styles.footer__section}>
			<h4 className={styles.footer__section__title}>{title}</h4>
			<ul className={styles.footer__section__list}>
				{items.map((item) => (
					<li key={item.id} className='item'>
						<Link href={item.link}>{item.item}</Link>
					</li>
				))}
			</ul>
		</div>
	)
}

export default FooterSectionComponent
