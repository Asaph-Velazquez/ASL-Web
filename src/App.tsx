import { Route, Routes } from 'react-router';

import Home from './components/Home';
import StayManagement from './components/StayManagement';

function App() {
  return (
    <div>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stays" element={<StayManagement />} />
      </Routes>
    </div>
  )
}

export default App
