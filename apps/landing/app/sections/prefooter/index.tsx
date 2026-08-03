import { type FC } from 'react'
import styles from './styles.module.css'
import Link from 'next/link'
import LayoutWrapper from '@/components/layout-wrapper'

const PreFooter: FC = () => {
	return (
		<section className={styles.prefooter}>
			<LayoutWrapper>
				<div className={styles.grid__container}>
					<div>
						<h3 className={styles.heading}>
							Own your notes.
							<br />
							Own your data.
						</h3>
					</div>

					<div className={styles.links__outter__container}>
						<div className={styles.links__inner__container}>
							<Link
								className={styles.get__started__link}
								href='https://app.notekit.online'>
								Get started free
							</Link>
							<Link
								className={styles.github__link}
								href='https://github.com/notekit-io/notekit'>
								View on GitHub
							</Link>
						</div>
					</div>
				</div>
			</LayoutWrapper>
		</section>
	)
}

export default PreFooter
