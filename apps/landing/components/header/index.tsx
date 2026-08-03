import { type FC } from 'react'
import Link from 'next/link'
import styles from './styles.module.css'

const Header: FC = () => {
	return (
		<header className={styles.header}>
			<div className={styles.header__blur__mask} />
			<div className={styles.header__wrapper}>
				<div className={styles.header__root}>
					<ul className={styles.header__list}>
						<li className={styles.header__logo}>
							<Link href='/' className={styles.header__logo__link}>
								<svg viewBox='0 0 32 32' width='24' height='24'>
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
								<span className={styles.logo__text}>NoteKit</span>
							</Link>
						</li>

						<li className={`${styles.header__item} ${styles.hide__mobile}`}>
							<Link href='#' className={styles.header__link}>
								Features
							</Link>
						</li>
						<li className={`${styles.header__item} ${styles.hide__mobile}`}>
							<Link href='#' className={styles.header__link}>
								Pricing
							</Link>
						</li>
						<li className={`${styles.header__item} ${styles.hide__tablet}`}>
							<Link
								href='https://github.com/notekit-io/notekit'
								className={styles.header__link}>
								GitHub
							</Link>
						</li>

						<li className={styles.header__login}>
							<Link
								href='https://app.notekit.online'
								className={styles.button__login}>
								Sign in
							</Link>
						</li>
						<li className={styles.header__signup}>
							<Link
								href='https://app.notekit.online'
								className={styles.button__signup}>
								Get started
							</Link>
						</li>
					</ul>
				</div>
			</div>
		</header>
	)
}

export default Header
