function Toolbar({
  activeTool,
  setActiveTool,
  onSave,
  onUndo,
  onRedo,
  onDelete,
  autoSaveEnabled,
  onToggleAutoSave,
  autoSaveStatus,
  onHaptic,
}) {
  const tools = [
    { id: "select", label: "Select" },
    { id: "wall", label: "Wall" },
    { id: "door", label: "Door" },
    { id: "window", label: "Window" },
    { id: "stair", label: "Stair" },
    { id: "lift", label: "Lift" },
    { id: "room", label: "Room" },
    { id: "node", label: "Node" },
    { id: "connect", label: "Connect" },
    { id: "route", label: "Route" },
    { id: "room-route", label: "Room Route" },
  ];

  const chooseTool = (id) => {
    onHaptic?.(7);
    setActiveTool(id);
  };

  return (
    <div className="toolbar" aria-label="Admin map editor toolbar">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={activeTool === tool.id ? "tool active" : "tool"}
          onClick={() => chooseTool(tool.id)}
        >
          {tool.label}
        </button>
      ))}

      <div className="toolbar-divider" />

      <button type="button" className="tool" onClick={() => { onHaptic?.(8); onUndo(); }}>
        ↶ Undo
      </button>
      <button type="button" className="tool" onClick={() => { onHaptic?.(8); onRedo(); }}>
        ↷ Redo
      </button>
      <button type="button" className="tool delete-tool" onClick={() => { onHaptic?.([12, 20, 12]); onDelete(); }}>
        Delete
      </button>
      <button type="button" className="tool save-tool" onClick={() => { onHaptic?.(12); onSave(); }}>
        Save
      </button>
      <button
        type="button"
        className={autoSaveEnabled ? "tool auto-save-tool active" : "tool auto-save-tool"}
        onClick={() => { onHaptic?.(8); onToggleAutoSave(); }}
        title={autoSaveStatus}
      >
        {autoSaveEnabled ? "✓ Auto Save ON" : "Auto Save OFF"}
      </button>
    </div>
  );
}

export default Toolbar;
