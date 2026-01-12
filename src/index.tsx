/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'

import ViteMotionSolidD3Demo from './ViteMotionSolidD3-demo/Welcome.tsx'
import ViteMotionSolidD3DemoModular from './ViteMotionSolidD3-demo/Welcome-app.tsx'
import EffectFlow from './Reactivity/EffectFlow.tsx'
import FabrikDemoSolidD3 from './FABRIK/FabrikDemo-SolidD3'

const root = document.getElementById('root')

render(() => <FabrikDemoSolidD3 />, root!)
