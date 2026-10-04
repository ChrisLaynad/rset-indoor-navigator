import { useState } from "react";
import MapEditor from "./editor/MapEditor";
import { floors } from "./data/floors";

function App() {
  const [activeFloorId, setActiveFloorId] = useState(floors[0]?.id || "ground");
  const activeFloor = floors.find((item) => item.id === activeFloorId) || floors[0];

  if (!activeFloor) {
    return (
      <div className="app-empty-state">
        <h2>No floors configured</h2>
        <p>Check src/data/floors.js.</p>
      </div>
    );
  }

  return (
    <div className="app">
      <MapEditor
        floor={activeFloor}
        floors={floors}
        activeFloorId={activeFloorId}
        onFloorChange={setActiveFloorId}
      />
    </div>
  );
}

export default App;
