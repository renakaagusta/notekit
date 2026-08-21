'use client'

import { motion } from 'framer-motion'
import type { FC } from 'react';
import React from 'react'
import { blurPopUp } from '@/lib/animations'

interface Props {
	text: string
}

const BlurPopUpByWord: FC<Props> = ({ text }) => {
	const words = text.split(' ')
	return (
		<span className='block text-balance'>
			<span className='inline-block align-top text-balance'>
				{words.map((word, idx) => (
					<motion.span
						style={{ wordBreak: 'normal' }}
						key={idx}
						variants={blurPopUp}
						initial='initial'
						whileInView='animate'
						viewport={{ once: true }}
						transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 * idx }}>
						{word + (idx + 1 < words.length ? '    ' : '')}
					</motion.span>
				))}
			</span>
		</span>
	)
}

export default BlurPopUpByWord
