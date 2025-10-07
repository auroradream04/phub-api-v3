import { Route } from './src/lib/pornhub.js/dist/index.mjs'

console.log('Page 1:', Route.videoSearch('Japanese', { page: 1 }))
console.log('Page 2:', Route.videoSearch('Japanese', { page: 2 }))
console.log('Page 3:', Route.videoSearch('Japanese', { page: 3 }))
