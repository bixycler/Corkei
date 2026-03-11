/* @refresh reload */
import { render } from 'solid-js/web'
import './index.css'

//import Welcome from './artifacts/applets/ViteMotionSolidD3-demo/Welcome/Welcome.tsx'
//import WelcomeModular from './artifacts/applets/ViteMotionSolidD3-demo/WelcomeModular/Welcome-app.tsx'
import Corkei from './ui/Corkei.tsx'

const root = document.getElementById('root')

render(() => <Corkei explanationUrl="./src/artifacts/applets/FABRIK/FabrikExplanation.html" />, root!)
