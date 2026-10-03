import { useState } from "react";
import MapEditor from "./editor/MapEditor";
import { floors } from "./data/floors";

function App() {
  const [activeFloorId, setActiveFloorId] = useState(floors[0]?.id || "ground");

  const activeFloor =
    floors.find((item) => item.id === activeFloorId) || floors[0];

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
      <div className="floor-selector">
        <div className="floor-selector-inner">
          <div className="floor-selector-title">RSET Main Building</div>
          <div className="floor-buttons" role="tablist" aria-label="Floor selector">
            {floors.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === activeFloorId}
                className={item.id === activeFloorId ? "floor-button active" : "floor-button"}
                onClick={() => setActiveFloorId(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <MapEditor floor={activeFloor} />
    </div>
  );
}

export default App;
