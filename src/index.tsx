/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'

//import Welcome from './artifacts/applets/ViteMotionSolidD3-demo/Welcome/Welcome.tsx'
//import WelcomeModular from './artifacts/applets/ViteMotionSolidD3-demo/WelcomeModular/Welcome-app.tsx'
import FabrikDemoSolidSvg from './artifacts/applets/FABRIK/FabrikDemo-SolidSvg/FabrikDemo-SolidSvg.tsx'

const root = document.getElementById('root')

render(() => <FabrikDemoSolidSvg explanationUrl="./src/artifacts/applets/FABRIK/FabrikExplanation.html" />, root!)
