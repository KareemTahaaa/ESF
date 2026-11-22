import { Cairo } from 'next/font/google'

// Cairo is the face for the whole site, including the federation and club workspace.
export const beIN = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-bein',
  display: 'swap',
})
