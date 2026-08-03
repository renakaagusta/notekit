import { type FC } from 'react'
import styles from './styles.module.css'
import LayoutWrapper from '@/components/layout-wrapper'

const techItems = [
	{ name: 'GitHub', abbr: 'GH' },
	{ name: 'Forgejo', abbr: 'FJ' },
	{ name: 'age', abbr: 'age' },
	{ name: 'ProseMirror', abbr: 'PM' },
	{ name: 'BIP39', abbr: 'B39' },
	{ name: 'Git', abbr: 'git' },
	{ name: 'MCP', abbr: 'MCP' },
	{ name: 'IndexedDB', abbr: 'IDB' },
	{ name: 'X25519', abbr: 'X25' },
]

const TechStack: FC = () => {
	return (
		<section className={styles.customers}>
			<LayoutWrapper>
				<p className={styles.description__large__screen}>
					<span className={styles.highlight}>Built on open standards.</span>
					<br />
					No proprietary lock-in. Your data stays yours.
				</p>

				<p className={styles.description__small__screen}>
					Built on open standards. No proprietary lock-in.
				</p>

				<div className={styles.tech__grid}>
					{techItems.map((item) => (
						<div key={item.name} className={styles.tech__item}>
							<span className={styles.tech__abbr}>{item.abbr}</span>
							<span className={styles.tech__name}>{item.name}</span>
						</div>
					))}
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default TechStack
