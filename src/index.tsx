/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'

import ViteMotionSolidD3Demo from './ViteMotionSolidD3-demo/Welcome.tsx'
import ViteMotionSolidD3DemoModular from './ViteMotionSolidD3-demo/Welcome-app.tsx'

const root = document.getElementById('root')

render(() => <ViteMotionSolidD3DemoModular />, root!)
