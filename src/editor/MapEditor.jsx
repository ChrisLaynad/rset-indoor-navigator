import {
  useEffect,
  useRef,
  useState
} from "react";

import Toolbar from "./Toolbar";
import { initialMapData } from "../data/initialMapData";
import "../NavigationUI.css";

import {
  snapToEndpoint,
  snapAngle,
  findNearestWall,
  getWallRotation
} from "../utils/snapping";

const STORAGE_KEY = "rset-indoor-map-v1";
const AUTO_SAVE_KEY = "rset-indoor-auto-save";

const DOOR_WIDTH = 35;
const WINDOW_WIDTH = 60;

const STAIR_WIDTH = 60;
const STAIR_LENGTH = 70;

const LIFT_WIDTH = 50;
const LIFT_HEIGHT = 50;

const DOOR_SNAP_DISTANCE = 25;
const WINDOW_SNAP_DISTANCE = 45;

const MIN_ROOM_SIZE = 20;
const ROOM_HANDLE_SIZE = 10;
const ROOM_MOVE_SNAP = 5;

const NODE_SIZE = 8;
const NODE_GRID_SIZE = 5;
const CONNECTION_STROKE_WIDTH = 4;

// Front-end demo/admin gate. For production, move authentication to a backend.
const ADMIN_PASSWORD = "adminrset123";

function MapEditor({ floor }) {

  /* ==================================================
     MAP DATA
  ================================================== */

  const [mapData, setMapData] = useState(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.error(
        "Could not load saved map:",
        error
      );
    }

    return initialMapData;
  });

  const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(AUTO_SAVE_KEY);
      return saved === null ? true : saved === "true";
    } catch (error) {
      return true;
    }
  });

  const [autoSaveStatus, setAutoSaveStatus] = useState("Auto-save ready");

  /* ==================================================
     USER / ADMIN MODE
  ================================================== */

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminLoginError, setAdminLoginError] = useState("");

  const triggerHaptic = (pattern = 8) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(pattern);
      }
    } catch {
      // Haptics are optional and unavailable in some browsers, notably iOS Safari.
    }
  };

  const openAdminLogin = () => {
    triggerHaptic(10);
    setAdminPassword("");
    setAdminLoginError("");
    setShowAdminLogin(true);
  };

  const loginAdmin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      triggerHaptic([12, 25, 12]);
      setIsAdminMode(true);
      setShowAdminLogin(false);
      setAdminPassword("");
      setAdminLoginError("");
      setActiveTool("select");
      clearSelection();
      return;
    }

    triggerHaptic([35, 30, 35]);
    setAdminLoginError("Incorrect admin password.");
  };

  const logoutAdmin = () => {
    triggerHaptic(10);
    setIsAdminMode(false);
    setActiveTool("select");
    setConnectingNodeId(null);
    clearSelection();
  };

  /* ==================================================
     HISTORY
  ================================================== */

  const [history, setHistory] = useState([]);
  const [redoHistory, setRedoHistory] = useState([]);

  /* ==================================================
     ACTIVE TOOL
  ================================================== */

  const [activeTool, setActiveTool] =
    useState("select");

  /* ==================================================
     SELECTION
  ================================================== */

  const [selectedWallId, setSelectedWallId] =
    useState(null);

  const [selectedDoorId, setSelectedDoorId] =
    useState(null);

  const [selectedWindowId, setSelectedWindowId] =
    useState(null);

  const [selectedStairId, setSelectedStairId] =
    useState(null);

  const [selectedLiftId, setSelectedLiftId] =
    useState(null);

  const [selectedRoomId, setSelectedRoomId] =
    useState(null);

  const [selectedNodeId, setSelectedNodeId] =
    useState(null);

  const [selectedConnectionId, setSelectedConnectionId] =
    useState(null);

  const [connectingNodeId, setConnectingNodeId] =
    useState(null);

  /* ==================================================
     DIJKSTRA ROUTE
  ================================================== */

  const [routeStartNodeId, setRouteStartNodeId] =
    useState(null);

  const [routeEndNodeId, setRouteEndNodeId] =
    useState(null);

  const [routePath, setRoutePath] =
    useState([]);

  const [routeDistance, setRouteDistance] =
    useState(null);

  /* ==================================================
     ROOM-TO-ROOM ROUTE
  ================================================== */

  const [roomRouteStartId, setRoomRouteStartId] =
    useState("");

  const [roomRouteEndId, setRoomRouteEndId] =
    useState("");

  const [roomRoutePath, setRoomRoutePath] =
    useState([]);

  const [roomRouteDistance, setRoomRouteDistance] =
    useState(null);

  const [roomRouteAccess, setRoomRouteAccess] =
    useState(null);

  /* ==================================================
     MULTI-FLOOR ROOM ROUTE
  ================================================== */

  const [multiFloorRoute, setMultiFloorRoute] =
    useState(null);

  /* ==================================================
     WALL DRAWING
  ================================================== */

  const [isDrawing, setIsDrawing] =
    useState(false);

  const [startPoint, setStartPoint] =
    useState(null);

  const [currentPoint, setCurrentPoint] =
    useState(null);

  /* ==================================================
     STAIR DRAWING
  ================================================== */

  const [isDrawingStair, setIsDrawingStair] =
    useState(false);

  const [stairStartPoint, setStairStartPoint] =
    useState(null);

  const [stairRotation, setStairRotation] =
    useState(0);

  /* ==================================================
     ROOM DRAWING
  ================================================== */

  const [isDrawingRoom, setIsDrawingRoom] =
    useState(false);

  const [roomStartPoint, setRoomStartPoint] =
    useState(null);

  const [roomCurrentPoint, setRoomCurrentPoint] =
    useState(null);

  /* ==================================================
     ROOM EDITING
  ================================================== */

  const [roomEditMode, setRoomEditMode] =
    useState(null);

  /*
    null
    "move"
    "resize-nw"
    "resize-ne"
    "resize-sw"
    "resize-se"
  */

  const roomEditStart = useRef(null);

  /* ==================================================
     IMAGE
  ================================================== */

  const [imageSize, setImageSize] =
    useState({
      width: 0,
      height: 0
    });

  // Keep the native image dimensions for every floor that has been
  // opened. This lets corresponding stairs/lifts be aligned using
  // the same normalized building position even when floor-plan images
  // have different pixel dimensions.
  const [floorImageSizes, setFloorImageSizes] =
    useState({});

  const imageRef = useRef(null);
  const svgRef = useRef(null);

  /* ==================================================
     CURRENT FLOOR DATA
  ================================================== */

  const floorData =
    mapData[floor.id] || {};

  const walls =
    floorData.walls || [];

  const doors =
    floorData.doors || [];

  const windows =
    floorData.windows || [];

  const stairs =
    floorData.stairs || [];

  const lifts =
    floorData.lifts || [];

  const rooms =
    floorData.rooms || [];

  const nodes =
    floorData.nodes || [];

  const connections =
    floorData.connections || [];

  /* ==================================================
     FLOOR CHANGE
  ================================================== */

  useEffect(() => {

    clearSelection();

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);

    setIsDrawingStair(false);
    setStairStartPoint(null);

    setIsDrawingRoom(false);
    setRoomStartPoint(null);
    setRoomCurrentPoint(null);

    setRoomEditMode(null);
    roomEditStart.current = null;
    setConnectingNodeId(null);

    setRouteStartNodeId(null);
    setRouteEndNodeId(null);
    setRoutePath([]);
    setRouteDistance(null);

    setRoomRouteStartId("");
    setRoomRouteEndId("");
    setRoomRoutePath([]);
    setRoomRouteDistance(null);
    setRoomRouteAccess(null);

  }, [floor.id]);

  useEffect(() => {
    if (!multiFloorRoute) return;

    setRoomRoutePath(
      multiFloorRoute.segments?.[floor.id] || []
    );
  }, [floor.id, multiFloorRoute]);

  /* ==================================================
     AUTO SAVE
  ================================================== */

  useEffect(() => {
    try {
      localStorage.setItem(
        AUTO_SAVE_KEY,
        String(autoSaveEnabled)
      );
    } catch (error) {
      console.error("Could not save auto-save preference:", error);
    }
  }, [autoSaveEnabled]);

  useEffect(() => {
    if (!isAdminMode) {
      return;
    }

    if (!autoSaveEnabled) {
      setAutoSaveStatus("Auto-save off");
      return;
    }

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(mapData)
        );
        setAutoSaveStatus(
          `Auto-saved ${new Date().toLocaleTimeString()}`
        );
      } catch (error) {
        console.error("Automatic save failed:", error);
        setAutoSaveStatus("Auto-save failed");
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [mapData, autoSaveEnabled, isAdminMode]);

  /* ==================================================
     SAVE
  ================================================== */

  const saveMap = () => {

    if (!isAdminMode) {
      return;
    }

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(mapData)
      );

      alert(
        "Map saved successfully."
      );

    } catch (error) {

      console.error(
        "Could not save map:",
        error
      );

      alert(
        "Could not save map."
      );
    }
  };

  /* ==================================================
     HISTORY
  ================================================== */

  const createHistoryPoint = () => {

    setHistory((previous) => [
      ...previous,
      JSON.parse(
        JSON.stringify(mapData)
      )
    ]);

    setRedoHistory([]);
  };

  /* ==================================================
     UPDATE CURRENT FLOOR
  ================================================== */

  const updateCurrentFloor = (
    updater
  ) => {

    setMapData((previous) => {

      const currentFloorData =
        previous[floor.id] || {};

      const updatedFloor =
        typeof updater === "function"
          ? updater(currentFloorData)
          : updater;

      return {
        ...previous,
        [floor.id]:
          updatedFloor
      };
    });
  };

  /* ==================================================
     SCREEN -> MAP
  ================================================== */

  const getMapPoint = (event) => {

    const svg =
      svgRef.current;

    if (!svg) {
      return null;
    }

    const screenMatrix =
      svg.getScreenCTM();

    if (!screenMatrix) {
      return null;
    }

    const point =
      svg.createSVGPoint();

    point.x = event.clientX;
    point.y = event.clientY;

    const mapPoint =
      point.matrixTransform(
        screenMatrix.inverse()
      );

    return {
      x: mapPoint.x,
      y: mapPoint.y
    };
  };

  /* ==================================================
     NORMALIZE ROOM RECTANGLE
  ================================================== */

  const getNormalizedRectangle = (
    start,
    end
  ) => {

    const x =
      Math.min(
        start.x,
        end.x
      );

    const y =
      Math.min(
        start.y,
        end.y
      );

    const width =
      Math.abs(
        end.x -
        start.x
      );

    const height =
      Math.abs(
        end.y -
        start.y
      );

    return {
      x,
      y,
      width,
      height
    };
  };

  /* ==================================================
     DOOR
  ================================================== */

  const placeDoor = (point) => {

    const nearest =
      findNearestWall(
        point,
        walls,
        DOOR_SNAP_DISTANCE
      );

    if (!nearest) {
      return;
    }

    createHistoryPoint();

    const rotation =
      getWallRotation(
        nearest.wall
      );

    const door = {

      id:
        crypto.randomUUID(),

      type:
        "door",

      x:
        nearest.point.x,

      y:
        nearest.point.y,

      width:
        DOOR_WIDTH,

      rotation,

      wallId:
        nearest.wall.id
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        doors: [
          ...(current.doors || []),
          door
        ]
      })
    );
  };

  /* ==================================================
     WINDOW
  ================================================== */

  const placeWindow = (point) => {

    const nearest =
      findNearestWall(
        point,
        walls,
        WINDOW_SNAP_DISTANCE
      );

    if (!nearest) {
      return;
    }

    createHistoryPoint();

    const rotation =
      getWallRotation(
        nearest.wall
      );

    const windowObject = {

      id:
        crypto.randomUUID(),

      type:
        "window",

      x:
        nearest.point.x,

      y:
        nearest.point.y,

      width:
        WINDOW_WIDTH,

      rotation,

      wallId:
        nearest.wall.id
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        windows: [
          ...(current.windows || []),
          windowObject
        ]
      })
    );
  };

  /* ==================================================
     LIFT
  ================================================== */

  const placeLift = (point) => {

    createHistoryPoint();

    const floorOrder = [
      "ground",
      "first",
      "second",
      "third"
    ];

    const currentIndex =
      floorOrder.indexOf(
        floor.id
      );

    let connectedFloor = null;

    if (
      currentIndex >= 0 &&
      currentIndex <
        floorOrder.length - 1
    ) {

      connectedFloor =
        floorOrder[
          currentIndex + 1
        ];

    } else if (
      currentIndex > 0
    ) {

      connectedFloor =
        floorOrder[
          currentIndex - 1
        ];
    }

    const lift = {

      id:
        crypto.randomUUID(),

      type:
        "lift",

      x:
        point.x -
        LIFT_WIDTH / 2,

      y:
        point.y -
        LIFT_HEIGHT / 2,

      width:
        LIFT_WIDTH,

      height:
        LIFT_HEIGHT,

      rotation:
        0,

      connectionId:
        crypto.randomUUID(),

      connectedFloor
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        lifts: [
          ...(current.lifts || []),
          lift
        ]
      })
    );
  };

  /* ==================================================
     STAIR
  ================================================== */

  const startStair = (point) => {

    setIsDrawingStair(true);

    // The stair anchor is its CENTER, not its top-left corner.
    // This makes the architectural footprint predictable and makes
    // cross-floor alignment possible.
    setStairStartPoint(point);
    setCurrentPoint(point);
    setStairRotation(0);
  };

  const moveStair = (point) => {

    if (!stairStartPoint) {
      return;
    }

    const dx =
      point.x -
      stairStartPoint.x;

    const dy =
      point.y -
      stairStartPoint.y;

    const angle =
      Math.atan2(
        dy,
        dx
      );

    setStairRotation(angle);
    setCurrentPoint(point);
  };

  const getStairAlignmentPoint = (
    rawPoint,
    targetFloorId
  ) => {

    if (!targetFloorId) {
      return {
        point: rawPoint,
        connectionId: null,
        aligned: false
      };
    }

    const currentSize =
      floorImageSizes[floor.id];

    const targetSize =
      floorImageSizes[targetFloorId];

    const targetData =
      mapData[targetFloorId] || {};

    const targetStairs =
      targetData.stairs || [];

    if (
      !currentSize?.width ||
      !currentSize?.height ||
      !targetSize?.width ||
      !targetSize?.height ||
      targetStairs.length === 0
    ) {
      return {
        point: rawPoint,
        connectionId: null,
        aligned: false
      };
    }

    // Convert every existing connector on the adjacent floor into
    // the current floor's coordinate system using normalized position.
    let nearest = null;

    targetStairs.forEach((targetStair) => {
      const targetCenter = {
        x: targetStair.x,
        y: targetStair.y
      };

      const normalizedX =
        targetCenter.x / targetSize.width;
      const normalizedY =
        targetCenter.y / targetSize.height;

      const projectedPoint = {
        x: normalizedX * currentSize.width,
        y: normalizedY * currentSize.height
      };

      const distance = getDistance(
        rawPoint,
        projectedPoint
      );

      if (!nearest || distance < nearest.distance) {
        nearest = {
          targetStair,
          projectedPoint,
          distance
        };
      }
    });

    // Only snap when the user starts close to the projected connector.
    // This prevents an unrelated stair elsewhere on the plan from
    // unexpectedly moving.
    const ALIGN_SNAP_DISTANCE = 100;

    if (
      !nearest ||
      nearest.distance > ALIGN_SNAP_DISTANCE
    ) {
      return {
        point: rawPoint,
        connectionId: null,
        aligned: false
      };
    }

    return {
      point: nearest.projectedPoint,
      connectionId:
        nearest.targetStair.connectionId || null,
      aligned: true
    };
  };

  const finishStair = (point) => {

    if (!stairStartPoint) {
      return;
    }

    const dx =
      point.x -
      stairStartPoint.x;

    const dy =
      point.y -
      stairStartPoint.y;

    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    if (distance < 10) {

      setIsDrawingStair(false);
      setStairStartPoint(null);
      setCurrentPoint(null);

      return;
    }

    createHistoryPoint();

    const floorOrder = [
      "ground",
      "first",
      "second",
      "third"
    ];

    const currentIndex =
      floorOrder.indexOf(
        floor.id
      );

    let connectedFloor = null;

    if (
      currentIndex >= 0 &&
      currentIndex <
        floorOrder.length - 1
    ) {

      connectedFloor =
        floorOrder[
          currentIndex + 1
        ];

    } else if (
      currentIndex > 0
    ) {

      connectedFloor =
        floorOrder[
          currentIndex - 1
        ];
    }

    const alignment =
      getStairAlignmentPoint(
        stairStartPoint,
        connectedFloor
      );

    const stair = {

      id:
        crypto.randomUUID(),

      type:
        "stair",

      // x/y are ALWAYS the CENTER of the stair footprint.
      x:
        alignment.point.x,

      y:
        alignment.point.y,

      width:
        STAIR_WIDTH,

      length:
        Math.max(
          STAIR_LENGTH,
          distance
        ),

      rotation:
        stairRotation,

      wallId:
        null,

      // Reuse the opposite stair's ID when automatic alignment
      // found the corresponding connector. Otherwise create a new
      // connector ID which can be paired later.
      connectionId:
        alignment.connectionId ||
        crypto.randomUUID(),

      connectedFloor
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        stairs: [
          ...(current.stairs || []),
          stair
        ]
      })
    );

    setIsDrawingStair(false);
    setStairStartPoint(null);
    setCurrentPoint(null);
    setStairRotation(0);
  };

  /* ==================================================
     NAVIGATION NODE
  ================================================== */

  const placeNode = (point) => {

    // Use the exact map coordinate where the user clicked.
    // Do not grid-snap nodes because even a small snap makes
    // the node appear away from the chosen point on the plan.
    const x = point.x;
    const y = point.y;

    const existingNode =
      nodes.find((node) => {

        const dx =
          node.x - x;

        const dy =
          node.y - y;

        return (
          Math.sqrt(
            dx * dx +
            dy * dy
          ) <= NODE_SIZE
        );
      });

    if (existingNode) {

      clearSelection();
      setSelectedNodeId(
        existingNode.id
      );

      return;
    }

    createHistoryPoint();

    const node = {

      id:
        crypto.randomUUID(),

      type:
        "node",

      x,
      y
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        nodes: [
          ...(current.nodes || []),
          node
        ]
      })
    );

    clearSelection();
    setSelectedNodeId(
      node.id
    );
  };



  /* ==================================================
     ROOM CREATION
  ================================================== */

  const startRoom = (point) => {

    setIsDrawingRoom(true);

    setRoomStartPoint(point);

    setRoomCurrentPoint(point);
  };

  const moveRoom = (point) => {

    if (!roomStartPoint) {
      return;
    }

    setRoomCurrentPoint(point);
  };

  const finishRoom = (point) => {

    if (!roomStartPoint) {
      return;
    }

    const rectangle =
      getNormalizedRectangle(
        roomStartPoint,
        point
      );

    setIsDrawingRoom(false);
    setRoomStartPoint(null);
    setRoomCurrentPoint(null);

    if (
      rectangle.width <
        MIN_ROOM_SIZE ||
      rectangle.height <
        MIN_ROOM_SIZE
    ) {
      return;
    }

    const defaultName =
      `Room ${rooms.length + 1}`;

    const roomName =
      window.prompt(
        "Enter room name:",
        defaultName
      );

    if (
      roomName === null
    ) {
      return;
    }

    const cleanedName =
      roomName.trim();

    if (!cleanedName) {
      return;
    }

    createHistoryPoint();

    const room = {

      id:
        crypto.randomUUID(),

      type:
        "room",

      name:
        cleanedName,

      x:
        rectangle.x,

      y:
        rectangle.y,

      width:
        rectangle.width,

      height:
        rectangle.height,

      rotation:
        0
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        rooms: [
          ...(current.rooms || []),
          room
        ]
      })
    );

    setSelectedRoomId(
      room.id
    );
  };

  /* ==================================================
     NODE / CONNECTIONS
  ================================================== */

  const handleConnectNode = (nodeId) => {
    if (!connectingNodeId) {
      setConnectingNodeId(nodeId);
      clearSelection();
      setSelectedNodeId(nodeId);
      return;
    }

    if (connectingNodeId === nodeId) {
      return;
    }

    const exists = connections.some((connection) =>
      (connection.from === connectingNodeId && connection.to === nodeId) ||
      (connection.from === nodeId && connection.to === connectingNodeId)
    );

    if (exists) {
      setConnectingNodeId(null);
      return;
    }

    const fromNode = nodes.find((node) => node.id === connectingNodeId);
    const toNode = nodes.find((node) => node.id === nodeId);

    if (!fromNode || !toNode) {
      setConnectingNodeId(null);
      return;
    }

    createHistoryPoint();

    const dx = toNode.x - fromNode.x;
    const dy = toNode.y - fromNode.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const connection = {
      id: crypto.randomUUID(),
      type: "connection",
      from: fromNode.id,
      to: toNode.id,
      distance
    };

    updateCurrentFloor((current) => ({
      ...current,
      connections: [...(current.connections || []), connection]
    }));

    setConnectingNodeId(null);
    clearSelection();
  };

  const selectNode = (event, nodeId) => {
    event.stopPropagation();

    if (activeTool === "connect") {
      handleConnectNode(nodeId);
      return;
    }

    if (activeTool === "route") {
      handleRouteNode(nodeId);
      return;
    }

    if (activeTool !== "select") {
      return;
    }

    clearSelection();
    setSelectedNodeId(nodeId);
  };

  const selectConnection = (event, connectionId) => {
    event.stopPropagation();

    if (activeTool !== "select") {
      return;
    }

    clearSelection();
    setSelectedConnectionId(connectionId);
  };

  /* ==================================================
     DIJKSTRA SHORTEST PATH
  ================================================== */

  const findShortestPath = (startId, endId) => {

    const distances = new Map();
    const previous = new Map();
    const unvisited = new Set();

    nodes.forEach((node) => {
      distances.set(node.id, Infinity);
      previous.set(node.id, null);
      unvisited.add(node.id);
    });

    if (!distances.has(startId) || !distances.has(endId)) {
      return null;
    }

    distances.set(startId, 0);

    while (unvisited.size > 0) {

      let currentId = null;
      let currentDistance = Infinity;

      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId);

        if (distance < currentDistance) {
          currentDistance = distance;
          currentId = nodeId;
        }
      }

      if (currentId === null) {
        break;
      }

      unvisited.delete(currentId);

      if (currentId === endId) {
        break;
      }

      const connectedEdges = connections.filter((connection) =>
        connection.from === currentId ||
        connection.to === currentId
      );

      for (const connection of connectedEdges) {

        const neighborId =
          connection.from === currentId
            ? connection.to
            : connection.from;

        if (!unvisited.has(neighborId)) {
          continue;
        }

        const fromNode = nodes.find(
          (node) => node.id === currentId
        );

        const toNode = nodes.find(
          (node) => node.id === neighborId
        );

        if (!fromNode || !toNode) {
          continue;
        }

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;

        const edgeDistance =
          Number.isFinite(connection.distance)
            ? connection.distance
            : Math.sqrt(dx * dx + dy * dy);

        const alternativeDistance =
          currentDistance + edgeDistance;

        if (alternativeDistance < distances.get(neighborId)) {
          distances.set(
            neighborId,
            alternativeDistance
          );

          previous.set(
            neighborId,
            currentId
          );
        }
      }
    }

    if (
      startId !== endId &&
      previous.get(endId) === null
    ) {
      return null;
    }

    const path = [];
    let currentId = endId;

    while (currentId !== null) {
      path.unshift(currentId);

      if (currentId === startId) {
        break;
      }

      currentId = previous.get(currentId);
    }

    if (path[0] !== startId) {
      return null;
    }

    return {
      path,
      distance: distances.get(endId)
    };
  };

  /* ==================================================
     MULTI-FLOOR GRAPH HELPERS
  ================================================== */

  const FLOOR_ORDER = [
    "ground",
    "first",
    "second",
    "third"
  ];

  const getGlobalNodeKey = (floorId, nodeId) =>
    `${floorId}:${nodeId}`;

  const getFloorObjects = (floorId) => {
    return mapData[floorId] || {};
  };

  const getObjectCenter = (item) => {
    if (item.type === "stair") {
      return {
        x: item.x,
        y: item.y
      };
    }

    return {
      x: item.x + (item.width || 0) / 2,
      y: item.y + (item.height || 0) / 2
    };
  };

  const getFloorCoordinateBounds = (floorId) => {
    const data = getFloorObjects(floorId);
    const xs = [];
    const ys = [];

    const addPoint = (x, y) => {
      if (Number.isFinite(x)) xs.push(x);
      if (Number.isFinite(y)) ys.push(y);
    };

    (data.nodes || []).forEach((item) => addPoint(item.x, item.y));
    (data.doors || []).forEach((item) => addPoint(item.x, item.y));
    (data.windows || []).forEach((item) => addPoint(item.x, item.y));
    (data.stairs || []).forEach((item) => addPoint(item.x, item.y));
    (data.lifts || []).forEach((item) => addPoint(
      item.x + (item.width || 0) / 2,
      item.y + (item.height || 0) / 2
    ));

    (data.rooms || []).forEach((item) => {
      addPoint(item.x, item.y);
      addPoint(
        item.x + (item.width || 0),
        item.y + (item.height || 0)
      );
    });

    (data.walls || []).forEach((item) => {
      addPoint(item.x1, item.y1);
      addPoint(item.x2, item.y2);
    });

    if (xs.length === 0 || ys.length === 0) return null;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1)
    };
  };

  const getNormalizedFloorPoint = (point, floorId) => {
    const size = floorImageSizes[floorId];

    if (size?.width && size?.height) {
      return {
        x: point.x / size.width,
        y: point.y / size.height
      };
    }

    const bounds = getFloorCoordinateBounds(floorId);

    if (!bounds) return null;

    return {
      x: (point.x - bounds.minX) / bounds.width,
      y: (point.y - bounds.minY) / bounds.height
    };
  };

  const getVerticalLinks = () => {
    const links = [];

    // Build the building as a continuous vertical graph.  A physical
    // stair/lift does not need to have the same ID on every floor: older
    // maps may have been created before connectionId was introduced.
    // We therefore match in this order:
    //   1. exact connectionId
    //   2. nearest connector of the same type by normalized position
    //   3. nearest connector of another vertical type by normalized position
    // The same connector may be paired more than once when a floor has a
    // different number of connectors; this is intentional and prevents a
    // valid floor from becoming an isolated layer of the building graph.

    const connectorItems = (data) => [
      ...(data.stairs || []).map((item) => ({ ...item, _verticalType: "stair" })),
      ...(data.lifts || []).map((item) => ({ ...item, _verticalType: "lift" }))
    ];

    const makeLink = (lowerFloorId, upperFloorId, lowerItem, upperItem, method) => ({
      type: lowerItem._verticalType === upperItem._verticalType
        ? lowerItem._verticalType
        : "vertical",
      fromFloor: lowerFloorId,
      toFloor: upperFloorId,
      fromItem: lowerItem,
      toItem: upperItem,
      distance: getDistance(
        getObjectCenter(lowerItem),
        getObjectCenter(upperItem)
      ),
      matchMethod: method
    });

    const normalizedConnectorDistance = (
      lowerFloorId,
      lowerItem,
      upperFloorId,
      upperItem
    ) => {
      const lowerPoint = getNormalizedFloorPoint(
        getObjectCenter(lowerItem),
        lowerFloorId
      );
      const upperPoint = getNormalizedFloorPoint(
        getObjectCenter(upperItem),
        upperFloorId
      );

      if (!lowerPoint || !upperPoint) {
        return getDistance(
          getObjectCenter(lowerItem),
          getObjectCenter(upperItem)
        );
      }

      return getDistance(lowerPoint, upperPoint);
    };

    for (let index = 0; index < FLOOR_ORDER.length - 1; index += 1) {
      const lowerFloorId = FLOOR_ORDER[index];
      const upperFloorId = FLOOR_ORDER[index + 1];
      const lower = getFloorObjects(lowerFloorId);
      const upper = getFloorObjects(upperFloorId);

      const lowerItems = connectorItems(lower);
      const upperItems = connectorItems(upper);

      if (!lowerItems.length || !upperItems.length) continue;

      const usedExactUpper = new Set();
      const linkedLower = new Set();

      // PASS 1: exact connectionId.
      lowerItems.forEach((lowerItem) => {
        if (!lowerItem.connectionId) return;

        const match = upperItems.find(
          (upperItem) =>
            !usedExactUpper.has(upperItem.id) &&
            upperItem.connectionId &&
            upperItem.connectionId === lowerItem.connectionId &&
            upperItem._verticalType === lowerItem._verticalType
        );

        if (!match) return;

        usedExactUpper.add(match.id);
        linkedLower.add(lowerItem.id);
        links.push(
          makeLink(
            lowerFloorId,
            upperFloorId,
            lowerItem,
            match,
            "connectionId"
          )
        );
      });

      // PASS 2: for every still-unlinked connector, choose the nearest
      // connector of the SAME type.  We deliberately do not require a
      // one-to-one pairing: if one floor has one stair and the next has
      // two, both upper stairs can still participate in navigation.
      lowerItems.forEach((lowerItem) => {
        if (linkedLower.has(lowerItem.id)) return;

        const lowerCenter = getObjectCenter(lowerItem);
        const sameType = upperItems.filter(
          (upperItem) => upperItem._verticalType === lowerItem._verticalType
        );

        if (!sameType.length) return;

        let best = null;
        sameType.forEach((upperItem) => {
          const distance = normalizedConnectorDistance(
            lowerFloorId,
            lowerItem,
            upperFloorId,
            upperItem
          );

          if (!best || distance < best.distance) {
            best = { upperItem, distance };
          }
        });

        if (!best) return;

        linkedLower.add(lowerItem.id);
        links.push(
          makeLink(
            lowerFloorId,
            upperFloorId,
            lowerItem,
            best.upperItem,
            "nearestSameType"
          )
        );
      });

      // PASS 3: if a floor has only stairs while the adjacent floor has
      // only lifts (or vice versa), do not leave the building disconnected.
      // A vertical connector is still a valid way of changing floors.
      lowerItems.forEach((lowerItem) => {
        if (linkedLower.has(lowerItem.id)) return;

        const lowerCenter = getObjectCenter(lowerItem);
        let best = null;

        upperItems.forEach((upperItem) => {
          const distance = normalizedConnectorDistance(
            lowerFloorId,
            lowerItem,
            upperFloorId,
            upperItem
          );

          if (!best || distance < best.distance) {
            best = { upperItem, distance };
          }
        });

        if (!best) return;

        linkedLower.add(lowerItem.id);
        links.push(
          makeLink(
            lowerFloorId,
            upperFloorId,
            lowerItem,
            best.upperItem,
            "nearestVerticalFallback"
          )
        );
      });

      // PASS 4: ensure every upper connector also has a way into the
      // lower floor. This matters when connector counts differ between
      // floors. Duplicate links are avoided.
      upperItems.forEach((upperItem) => {
        const alreadyLinked = links.some(
          (link) =>
            link.fromFloor === lowerFloorId &&
            link.toFloor === upperFloorId &&
            link.toItem.id === upperItem.id
        );

        if (alreadyLinked) return;

        let best = null;
        lowerItems.forEach((lowerItem) => {
          const distance = normalizedConnectorDistance(
            lowerFloorId,
            lowerItem,
            upperFloorId,
            upperItem
          );

          if (!best || distance < best.distance) {
            best = { lowerItem, distance };
          }
        });

        if (!best) return;

        links.push(
          makeLink(
            lowerFloorId,
            upperFloorId,
            best.lowerItem,
            upperItem,
            "upperConnectorFallback"
          )
        );
      });
    }

    return links;
  };

  // Every vertical connector is part of the unified building graph.
  // A connector is attached to the nearest navigation node on each
  // adjacent floor. Shared connectionId is preferred; normalized
  // architectural position is used as the fallback.
  const getUnifiedBuildingGraphInfo = () => {
    const verticalLinks = getVerticalLinks();
    const attachments = verticalLinks.map((link) => {
      const lowerData = getFloorObjects(link.fromFloor);
      const upperData = getFloorObjects(link.toFloor);
      const lowerCenter = getObjectCenter(link.fromItem);
      const upperCenter = getObjectCenter(link.toItem);

      const nearest = (data, center) =>
        (data.nodes || [])
          .map((node) => ({
            node,
            distance: getDistance(node, center)
          }))
          .sort((a, b) => a.distance - b.distance)[0] || null;

      return {
        ...link,
        lowerNode: nearest(lowerData, lowerCenter),
        upperNode: nearest(upperData, upperCenter)
      };
    });

    return {
      floorOrder: FLOOR_ORDER,
      verticalLinks,
      attachments
    };
  };

  const buildGlobalGraph = () => {
    const graph = new Map();

    // 1. Add every navigation node on every floor.
    FLOOR_ORDER.forEach((floorId) => {
      const data = getFloorObjects(floorId);
      (data.nodes || []).forEach((node) => {
        graph.set(getGlobalNodeKey(floorId, node.id), []);
      });
    });

    // 2. Existing floor connections are BIDIRECTIONAL.
    FLOOR_ORDER.forEach((floorId) => {
      const data = getFloorObjects(floorId);
      const nodes = data.nodes || [];

      (data.connections || []).forEach((connection) => {
        const fromNode = nodes.find((node) => node.id === connection.from);
        const toNode = nodes.find((node) => node.id === connection.to);
        if (!fromNode || !toNode) return;

        const from = getGlobalNodeKey(floorId, fromNode.id);
        const to = getGlobalNodeKey(floorId, toNode.id);
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const distance = Number.isFinite(connection.distance)
          ? connection.distance
          : Math.sqrt(dx * dx + dy * dy);

        graph.get(from).push({ to, distance, type: "floor" });
        graph.get(to).push({ to: from, distance, type: "floor" });
      });
    });

    /*
      3. Build the vertical building graph.

      IMPORTANT:
      We do not require connectionId equality, connector IDs, or the
      connector itself to have a navigation node exactly on top of it.
      Each adjacent pair of floors is connected through the physically
      corresponding stair/lift position. The nearest navigation node on
      each side is used as the portal node.

      Because every floor graph is already connected, ONE valid portal
      bridge is sufficient to connect the complete floor to the next floor.
      We add a bridge for every matched connector as well, giving Dijkstra
      multiple legitimate choices without changing mapData.
    */
    const verticalTransitions = [];

    const connectorCenter = (item) => getObjectCenter(item);

    const connectorList = (floorId) => {
      const data = getFloorObjects(floorId);
      return [
        ...(data.stairs || []).map((item) => ({
          ...item,
          _connectorType: "stair"
        })),
        ...(data.lifts || []).map((item) => ({
          ...item,
          _connectorType: "lift"
        }))
      ];
    };

    const nearestNodeToPoint = (floorId, point) => {
      const data = getFloorObjects(floorId);
      let best = null;

      (data.nodes || []).forEach((node) => {
        const distance = getDistance(node, point);
        if (!best || distance < best.distance) {
          best = { node, distance };
        }
      });

      return best;
    };

    const normalizedConnectorDistance = (
      lowerFloorId,
      lowerItem,
      upperFloorId,
      upperItem
    ) => {
      const a = getNormalizedFloorPoint(
        connectorCenter(lowerItem),
        lowerFloorId
      );
      const b = getNormalizedFloorPoint(
        connectorCenter(upperItem),
        upperFloorId
      );

      if (!a || !b) {
        return getDistance(
          connectorCenter(lowerItem),
          connectorCenter(upperItem)
        );
      }

      return getDistance(a, b);
    };

    for (let i = 0; i < FLOOR_ORDER.length - 1; i += 1) {
      const lowerFloorId = FLOOR_ORDER[i];
      const upperFloorId = FLOOR_ORDER[i + 1];
      const lowerConnectors = connectorList(lowerFloorId);
      const upperConnectors = connectorList(upperFloorId);

      if (!lowerConnectors.length || !upperConnectors.length) {
        continue;
      }

      const candidates = [];

      // Prefer same physical connector type and normalized position.
      lowerConnectors.forEach((lowerItem) => {
        upperConnectors.forEach((upperItem) => {
          const sameType =
            lowerItem._connectorType === upperItem._connectorType;

          const normalizedDistance = normalizedConnectorDistance(
            lowerFloorId,
            lowerItem,
            upperFloorId,
            upperItem
          );

          candidates.push({
            lowerItem,
            upperItem,
            sameType,
            normalizedDistance
          });
        });
      });

      candidates.sort((a, b) => {
        if (a.sameType !== b.sameType) {
          return a.sameType ? -1 : 1;
        }
        return a.normalizedDistance - b.normalizedDistance;
      });

      // Always create at least one bridge between adjacent floors.
      // Additional bridges are created for the closest same-type pairs.
      const selectedPairs = [];
      const selectedLower = new Set();
      const selectedUpper = new Set();

      // First pass: best unique same-type pairs.
      candidates
        .filter((candidate) => candidate.sameType)
        .forEach((candidate) => {
          if (selectedLower.has(candidate.lowerItem.id)) return;
          if (selectedUpper.has(candidate.upperItem.id)) return;

          selectedLower.add(candidate.lowerItem.id);
          selectedUpper.add(candidate.upperItem.id);
          selectedPairs.push(candidate);
        });

      // Second pass: ensure every lower connector has a physical partner
      // when connector counts differ.
      lowerConnectors.forEach((lowerItem) => {
        if (selectedLower.has(lowerItem.id)) return;

        const best = candidates
          .filter((candidate) => candidate.lowerItem.id === lowerItem.id)
          .sort((a, b) => {
            if (a.sameType !== b.sameType) {
              return a.sameType ? -1 : 1;
            }
            return a.normalizedDistance - b.normalizedDistance;
          })[0];

        if (!best) return;
        selectedLower.add(lowerItem.id);
        selectedPairs.push(best);
      });

      // Third pass: ensure every upper connector has a route down.
      upperConnectors.forEach((upperItem) => {
        if (selectedUpper.has(upperItem.id)) return;

        const best = candidates
          .filter((candidate) => candidate.upperItem.id === upperItem.id)
          .sort((a, b) => {
            if (a.sameType !== b.sameType) {
              return a.sameType ? -1 : 1;
            }
            return a.normalizedDistance - b.normalizedDistance;
          })[0];

        if (!best) return;
        selectedUpper.add(upperItem.id);
        selectedPairs.push(best);
      });

      // Final hard guarantee: if the matching logic somehow produced no
      // pair, use the globally nearest connector pair.
      if (selectedPairs.length === 0 && candidates.length > 0) {
        selectedPairs.push(candidates[0]);
      }

      selectedPairs.forEach((pair) => {
        const lowerCenter = connectorCenter(pair.lowerItem);
        const upperCenter = connectorCenter(pair.upperItem);
        const lowerNearest = nearestNodeToPoint(lowerFloorId, lowerCenter);
        const upperNearest = nearestNodeToPoint(upperFloorId, upperCenter);

        if (!lowerNearest || !upperNearest) return;

        const from = getGlobalNodeKey(
          lowerFloorId,
          lowerNearest.node.id
        );
        const to = getGlobalNodeKey(
          upperFloorId,
          upperNearest.node.id
        );

        if (!graph.has(from) || !graph.has(to)) return;

        // A virtual vertical transition represents entering the stair/lift,
        // travelling vertically, and exiting it on the adjacent floor.
        // Keep the cost small but non-zero so Dijkstra can choose between
        // different vertical options.
        const distance =
          lowerNearest.distance +
          upperNearest.distance +
          25;

        const connector = {
          fromFloor: lowerFloorId,
          toFloor: upperFloorId,
          fromItem: pair.lowerItem,
          toItem: pair.upperItem,
          normalizedDistance: pair.normalizedDistance,
          connectorType: pair.lowerItem._connectorType
        };

        const addDirected = (fromKey, toKey) => {
          const edges = graph.get(fromKey) || [];
          const duplicate = edges.some(
            (edge) =>
              edge.to === toKey &&
              edge.vertical === true
          );

          if (!duplicate) {
            edges.push({
              to: toKey,
              distance,
              type: pair.lowerItem._connectorType,
              vertical: true,
              guaranteedBridge: true,
              connector
            });
            graph.set(fromKey, edges);
          }
        };

        // Explicitly add BOTH directions.
        addDirected(from, to);
        addDirected(to, from);

        verticalTransitions.push({
          fromKey: from,
          toKey: to,
          connector,
          lowerNode: lowerNearest.node,
          upperNode: upperNearest.node
        });
      });
    }

    return {
      graph,
      verticalLinks: getVerticalLinks(),
      verticalTransitions
    };
  };

  const findGlobalShortestPath = (startKey, endKey) => {
    const { graph, verticalLinks } = buildGlobalGraph();

    if (!graph.has(startKey) || !graph.has(endKey)) {
      return null;
    }

    const distances = new Map();
    const previous = new Map();
    const previousEdge = new Map();
    const unvisited = new Set(graph.keys());

    graph.forEach((_, key) => {
      distances.set(key, Infinity);
      previous.set(key, null);
      previousEdge.set(key, null);
    });

    distances.set(startKey, 0);

    while (unvisited.size > 0) {
      let current = null;
      let currentDistance = Infinity;

      for (const key of unvisited) {
        const distance = distances.get(key);
        if (distance < currentDistance) {
          currentDistance = distance;
          current = key;
        }
      }

      if (current === null) break;
      unvisited.delete(current);
      if (current === endKey) break;

      for (const edge of graph.get(current) || []) {
        if (!unvisited.has(edge.to)) continue;

        const alternative = currentDistance + edge.distance;

        if (alternative < distances.get(edge.to)) {
          distances.set(edge.to, alternative);
          previous.set(edge.to, current);
          previousEdge.set(edge.to, edge);
        }
      }
    }

    if (startKey !== endKey && previous.get(endKey) === null) {
      return null;
    }

    const path = [];
    const edges = [];
    let current = endKey;

    while (current !== null) {
      path.unshift(current);

      const edge = previousEdge.get(current);
      if (edge) edges.unshift(edge);

      if (current === startKey) break;
      current = previous.get(current);
    }

    if (path[0] !== startKey) return null;

    const verticalTransitions = [];

    edges.forEach((edge, index) => {
      if (!edge.vertical) return;

      verticalTransitions.push({
        ...edge,
        fromKey: path[index],
        toKey: path[index + 1]
      });
    });

    return {
      path,
      distance: distances.get(endKey),
      edges,
      verticalTransitions,
      verticalLinks
    };
  };

  const handleRouteNode = (nodeId) => {

    // Manual node-to-node routing is always a SAME-FLOOR route.
    // Clear any previous room/multi-floor route so it cannot interfere
    // with the original Dijkstra visualization.
    setMultiFloorRoute(null);
    setRoomRoutePath([]);
    setRoomRouteDistance(null);
    setRoomRouteAccess(null);

    if (
      !routeStartNodeId ||
      routeEndNodeId
    ) {

      setRouteStartNodeId(nodeId);
      setRouteEndNodeId(null);
      setRoutePath([]);
      setRouteDistance(null);
      clearSelection();
      setSelectedNodeId(nodeId);
      return;
    }

    if (routeStartNodeId === nodeId) {
      return;
    }

    const result =
      findShortestPath(
        routeStartNodeId,
        nodeId
      );

    if (!result) {
      setRouteEndNodeId(null);
      setRoutePath([]);
      setRouteDistance(null);
      alert(
        "No connected route exists between these nodes."
      );
      return;
    }

    setRouteEndNodeId(nodeId);
    setRoutePath(result.path);
    setRouteDistance(result.distance);
    clearSelection();
  };

  /* ==================================================
     ROOM ACCESS MAPPING
  ================================================== */

  const getDistance = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getDistanceToRoomBoundary = (point, room) => {
    const left = room.x;
    const right = room.x + room.width;
    const top = room.y;
    const bottom = room.y + room.height;

    const clampedX = Math.max(left, Math.min(point.x, right));
    const clampedY = Math.max(top, Math.min(point.y, bottom));

    return getDistance(point, { x: clampedX, y: clampedY });
  };

  const getRoomAccess = (room) => {
    if (!room || doors.length === 0 || nodes.length === 0) {
      return null;
    }

    // Door centers in the saved architectural data are not always exactly
    // on the room rectangle boundary. Use a generous, geometry-based search
    // radius instead of rejecting a valid room just because the door is a
    // little farther from the editable room rectangle.
    const roomDiagonal = Math.sqrt(
      room.width * room.width +
      room.height * room.height
    );

    const DOOR_ROOM_DISTANCE = Math.max(120, roomDiagonal * 0.75);

    let candidateDoors = doors
      .map((door) => ({
        door,
        distance: getDistanceToRoomBoundary(
          { x: door.x, y: door.y },
          room
        )
      }))
      .filter((item) => item.distance <= DOOR_ROOM_DISTANCE)
      .sort((a, b) => a.distance - b.distance);

    // If the room rectangle has been moved/resized independently from the
    // original door, still use the closest door on this floor rather than
    // failing the entire room-to-room navigation request.
    if (candidateDoors.length === 0 && doors.length > 0) {
      candidateDoors = doors
        .map((door) => ({
          door,
          distance: getDistanceToRoomBoundary(
            { x: door.x, y: door.y },
            room
          )
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
    }

    if (candidateDoors.length === 0) {
      return null;
    }

    let best = null;

    for (const candidate of candidateDoors) {
      const accessibleNodes = nodes.filter(
        (node) => !isPointInsideRoom(node, room)
      );

      if (accessibleNodes.length === 0) {
        continue;
      }

      let nearestNode = null;
      let nearestDistance = Infinity;

      for (const node of accessibleNodes) {
        const distance = getDistance(
          { x: candidate.door.x, y: candidate.door.y },
          node
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestNode = node;
        }
      }

      if (!nearestNode) {
        continue;
      }

      const totalAccessDistance =
        candidate.distance + nearestDistance;

      if (!best || totalAccessDistance < best.totalAccessDistance) {
        best = {
          roomId: room.id,
          roomName: room.name,
          doorId: candidate.door.id,
          doorPoint: {
            x: candidate.door.x,
            y: candidate.door.y
          },
          nodeId: nearestNode.id,
          nodePoint: {
            x: nearestNode.x,
            y: nearestNode.y
          },
          roomCenter: {
            x: room.x + room.width / 2,
            y: room.y + room.height / 2
          },
          roomToDoorDistance: candidate.distance,
          doorToNodeDistance: nearestDistance,
          totalAccessDistance
        };
      }
    }

    return best;
  };

  /* ==================================================
     FLOOR-LOCAL PATH HELPER
     Used by multi-floor room routing to make sure the room's
     selected access node actually belongs to a component that
     can reach a stair/lift on that floor.
  ================================================== */

  const findFloorShortestPath = (floorId, startId, endId) => {
    const data = getFloorObjects(floorId);
    const floorNodes = data.nodes || [];
    const floorConnections = data.connections || [];

    if (!floorNodes.some((node) => node.id === startId)) return null;
    if (!floorNodes.some((node) => node.id === endId)) return null;

    const distances = new Map();
    const previous = new Map();
    const unvisited = new Set();

    floorNodes.forEach((node) => {
      distances.set(node.id, Infinity);
      previous.set(node.id, null);
      unvisited.add(node.id);
    });

    distances.set(startId, 0);

    while (unvisited.size > 0) {
      let currentId = null;
      let currentDistance = Infinity;

      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId);
        if (distance < currentDistance) {
          currentDistance = distance;
          currentId = nodeId;
        }
      }

      if (currentId === null) break;
      unvisited.delete(currentId);

      if (currentId === endId) break;

      const connectedEdges = floorConnections.filter(
        (connection) =>
          connection.from === currentId ||
          connection.to === currentId
      );

      for (const connection of connectedEdges) {
        const neighborId =
          connection.from === currentId
            ? connection.to
            : connection.from;

        if (!unvisited.has(neighborId)) continue;

        const fromNode = floorNodes.find(
          (node) => node.id === currentId
        );
        const toNode = floorNodes.find(
          (node) => node.id === neighborId
        );

        if (!fromNode || !toNode) continue;

        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const edgeDistance = Number.isFinite(connection.distance)
          ? connection.distance
          : Math.sqrt(dx * dx + dy * dy);

        const alternative = currentDistance + edgeDistance;

        if (alternative < distances.get(neighborId)) {
          distances.set(neighborId, alternative);
          previous.set(neighborId, currentId);
        }
      }
    }

    if (startId !== endId && previous.get(endId) === null) {
      return null;
    }

    const path = [];
    let currentId = endId;

    while (currentId !== null) {
      path.unshift(currentId);
      if (currentId === startId) break;
      currentId = previous.get(currentId);
    }

    if (path[0] !== startId) return null;

    return {
      path,
      distance: distances.get(endId)
    };
  };

  /* ==================================================
     CONNECTOR NODE DISCOVERY
     Return the actual navigation nodes attached to stairs/lifts
     on a particular floor. Room access nodes on a multi-floor
     route must be able to reach one of these nodes.
  ================================================== */

  const getConnectorNodeIds = (floorId) => {
    const ids = new Set();
    const links = getVerticalLinks();
    const data = getFloorObjects(floorId);

    // A stair/lift can have several nearby corridor nodes. Do not assume
    // that only the three closest nodes are the ones connected to the
    // usable corridor. Include a generous local neighbourhood and then
    // the closest nodes as a fallback.
    const CONNECTOR_NODE_RADIUS = 250;
    const MAX_CONNECTOR_NODES_PER_ITEM = 12;

    links.forEach((link) => {
      let item = null;

      if (link.fromFloor === floorId) {
        item = link.fromItem;
      } else if (link.toFloor === floorId) {
        item = link.toItem;
      }

      if (!item) return;

      const center = getObjectCenter(item);

      const candidates = (data.nodes || [])
        .map((node) => ({
          node,
          distance: getDistance(node, center)
        }))
        .sort((a, b) => a.distance - b.distance);

      candidates
        .filter(
          (candidate, index) =>
            candidate.distance <= CONNECTOR_NODE_RADIUS ||
            index < MAX_CONNECTOR_NODES_PER_ITEM
        )
        .slice(0, MAX_CONNECTOR_NODES_PER_ITEM)
        .forEach((candidate) => {
          ids.add(candidate.node.id);
        });
    });

    return [...ids];
  };

  const findRoomRoute = () => {
    if (!roomRouteStartId || !roomRouteEndId) return;

    if (roomRouteStartId === roomRouteEndId) {
      alert("Choose two different rooms.");
      return;
    }

    const findRoomDescriptor = (roomId) => {
      for (const [floorId, data] of Object.entries(mapData)) {
        const room = (data.rooms || []).find(
          (item) => item.id === roomId
        );

        if (room) {
          return { floorId, room };
        }
      }

      return null;
    };

    const startDescriptor = findRoomDescriptor(roomRouteStartId);
    const endDescriptor = findRoomDescriptor(roomRouteEndId);

    if (!startDescriptor || !endDescriptor) {
      alert("Could not find one of the selected rooms.");
      return;
    }

    const isMultiFloor =
      startDescriptor.floorId !== endDescriptor.floorId;

    // For multi-floor routing we deliberately do NOT restrict room access
    // to a pre-selected stair/lift component. The global graph below creates
    // virtual stair bridges between adjacent floors. Since each of your
    // saved floor graphs is internally connected, any valid corridor node
    // can reach the floor's usable stair bridge.
    const startConnectorNodes = [];
    const endConnectorNodes = [];

    const getAccessForFloorRoom = (
      floorId,
      room,
      connectorNodeIds = []
    ) => {
      const data = getFloorObjects(floorId);
      const floorDoors = data.doors || [];
      const floorNodes = data.nodes || [];

      if (floorDoors.length === 0 || floorNodes.length === 0) {
        return null;
      }

      // Use the same tolerant room/door matching as same-floor routing.
      // This prevents a room from being rejected when its editable rectangle
      // is slightly offset from the original architectural door position.
      const roomDiagonal = Math.sqrt(
        room.width * room.width +
        room.height * room.height
      );

      const DOOR_ROOM_DISTANCE = Math.max(120, roomDiagonal * 0.75);

      let candidateDoors = floorDoors
        .map((door) => ({
          door,
          distance: getDistanceToRoomBoundary(
            { x: door.x, y: door.y },
            room
          )
        }))
        .filter(
          (item) => item.distance <= DOOR_ROOM_DISTANCE
        )
        .sort((a, b) => a.distance - b.distance);

      if (candidateDoors.length === 0 && floorDoors.length > 0) {
        candidateDoors = floorDoors
          .map((door) => ({
            door,
            distance: getDistanceToRoomBoundary(
              { x: door.x, y: door.y },
              room
            )
          }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3);
      }

      let best = null;

      for (const candidate of candidateDoors) {
        const accessibleNodes = floorNodes.filter(
          (node) => !isPointInsideRoom(node, room)
        );

        for (const node of accessibleNodes) {
          const doorToNodeDistance = getDistance(
            { x: candidate.door.x, y: candidate.door.y },
            node
          );

          let connectorDistance = 0;
          let connectorNodeId = null;

          if (connectorNodeIds.length > 0) {
            let nearestConnector = null;

            connectorNodeIds.forEach((connectorId) => {
              const localPath = findFloorShortestPath(
                floorId,
                node.id,
                connectorId
              );

              if (!localPath) return;

              if (
                !nearestConnector ||
                localPath.distance < nearestConnector.distance
              ) {
                nearestConnector = {
                  nodeId: connectorId,
                  distance: localPath.distance
                };
              }
            });

            // This node cannot reach any stair/lift component.
            if (!nearestConnector) continue;

            connectorDistance = nearestConnector.distance;
            connectorNodeId = nearestConnector.nodeId;
          }

          const totalAccessDistance =
            candidate.distance +
            doorToNodeDistance +
            connectorDistance;

          if (
            !best ||
            totalAccessDistance < best.totalAccessDistance
          ) {
            best = {
              floorId,
              roomId: room.id,
              roomName: room.name,
              doorId: candidate.door.id,
              doorPoint: {
                x: candidate.door.x,
                y: candidate.door.y
              },
              nodeId: node.id,
              nodePoint: {
                x: node.x,
                y: node.y
              },
              roomCenter: {
                x: room.x + room.width / 2,
                y: room.y + room.height / 2
              },
              roomToDoorDistance: candidate.distance,
              doorToNodeDistance,
              connectorDistance,
              connectorNodeId,
              totalAccessDistance
            };
          }
        }
      }

      return best;
    };

    const startAccess = getAccessForFloorRoom(
      startDescriptor.floorId,
      startDescriptor.room,
      []
    );

    const endAccess = getAccessForFloorRoom(
      endDescriptor.floorId,
      endDescriptor.room,
      []
    );

    if (!startAccess || !endAccess) {
      setMultiFloorRoute(null);
      setRoomRoutePath([]);
      setRoomRouteDistance(null);
      setRoomRouteAccess(null);

      alert(
        isMultiFloor
          ? "The selected rooms have doors and nodes, but the selected access nodes cannot reach a stair/lift on their respective floors. Make sure the corridor nodes are connected to the stair/lift nodes with the Connect tool."
          : "Could not find a door and navigation node for one of the selected rooms."
      );
      return;
    }

    /* ==================================================
       SAME-FLOOR ROUTING
    ================================================== */
    if (!isMultiFloor) {
      const localRoute = findShortestPath(
        startAccess.nodeId,
        endAccess.nodeId
      );

      if (!localRoute) {
        setMultiFloorRoute(null);
        setRoomRoutePath([]);
        setRoomRouteDistance(null);
        setRoomRouteAccess({
          start: startAccess,
          end: endAccess
        });

        alert(
          "The selected rooms have access points, but their navigation nodes are not connected on this floor."
        );
        return;
      }

      const totalDistance =
        startAccess.doorToNodeDistance +
        localRoute.distance +
        endAccess.doorToNodeDistance;

      setMultiFloorRoute(null);
      setRoomRoutePath(localRoute.path);
      setRoomRouteDistance(totalDistance);
      setRoomRouteAccess({
        start: startAccess,
        end: endAccess
      });
      setActiveTool("room-route");
      clearSelection();
      return;
    }

    /* ==================================================
       MULTI-FLOOR ROUTING
    ================================================== */
    const graphRoute = findGlobalShortestPath(
      getGlobalNodeKey(
        startAccess.floorId,
        startAccess.nodeId
      ),
      getGlobalNodeKey(
        endAccess.floorId,
        endAccess.nodeId
      )
    );

    if (!graphRoute) {
      setMultiFloorRoute(null);
      setRoomRoutePath([]);
      setRoomRouteDistance(null);
      setRoomRouteAccess({
        start: startAccess,
        end: endAccess
      });

      alert(
        "No continuous multi-floor route could be found between the selected rooms. The floor graphs are present, but the selected corridor components are not connected through a usable stair/lift path."
      );
      return;
    }

    const totalDistance =
      startAccess.doorToNodeDistance +
      graphRoute.distance +
      endAccess.doorToNodeDistance;

    const segments = {};

    graphRoute.path.forEach((globalKey) => {
      const separator = globalKey.indexOf(":");
      const floorId = globalKey.slice(0, separator);
      const nodeId = globalKey.slice(separator + 1);

      if (!segments[floorId]) {
        segments[floorId] = [];
      }

      segments[floorId].push(nodeId);
    });

    setMultiFloorRoute({
      start: startAccess,
      end: endAccess,
      path: graphRoute.path,
      edges: graphRoute.edges,
      segments,
      verticalTransitions: graphRoute.verticalTransitions,
      distance: totalDistance
    });

    setRoomRoutePath(segments[floor.id] || []);
    setRoomRouteDistance(totalDistance);
    setRoomRouteAccess({
      start: startAccess,
      end: endAccess
    });
    setActiveTool("room-route");
    clearSelection();
  };

  const clearRoomRoute = () => {
    setRoomRoutePath([]);
    setRoomRouteDistance(null);
    setRoomRouteAccess(null);
    setMultiFloorRoute(null);
  };

  /* ==================================================
     CLEAR SELECTION
  ================================================== */

  const clearSelection = () => {

    setSelectedWallId(null);
    setSelectedDoorId(null);
    setSelectedWindowId(null);
    setSelectedStairId(null);
    setSelectedLiftId(null);
    setSelectedRoomId(null);
    setSelectedNodeId(null);
    setSelectedConnectionId(null);
  };

  /* ==================================================
     ROOM HIT TEST
  ================================================== */

  const isPointInsideRoom = (
    point,
    room
  ) => {

    return (
      point.x >= room.x &&
      point.x <=
        room.x + room.width &&
      point.y >= room.y &&
      point.y <=
        room.y + room.height
    );
  };

  /* ==================================================
     ROOM HANDLE HIT TEST
  ================================================== */

  const getRoomHandle = (
    point,
    room
  ) => {

    const handles = {

      "resize-nw": {
        x: room.x,
        y: room.y
      },

      "resize-ne": {
        x:
          room.x +
          room.width,
        y:
          room.y
      },

      "resize-sw": {
        x:
          room.x,
        y:
          room.y +
          room.height
      },

      "resize-se": {
        x:
          room.x +
          room.width,
        y:
          room.y +
          room.height
      }
    };

    for (
      const [name, handle]
      of Object.entries(handles)
    ) {

      const dx =
        point.x -
        handle.x;

      const dy =
        point.y -
        handle.y;

      const distance =
        Math.sqrt(
          dx * dx +
          dy * dy
        );

      if (
        distance <=
        ROOM_HANDLE_SIZE
      ) {
        return name;
      }
    }

    return null;
  };

  /* ==================================================
     ROOM EDIT START
  ================================================== */

  const startRoomEdit = (
    event,
    room
  ) => {

    // Room editing is strictly an admin operation. The room SVG element
    // receives pointer events directly, so the canvas-level admin guard
    // does not protect this handler by itself.
    if (!isAdminMode) {
      return;
    }

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    event.stopPropagation();

    const point =
      getMapPoint(event);

    if (!point) {
      return;
    }

    setSelectedRoomId(
      room.id
    );

    setSelectedWallId(null);
    setSelectedDoorId(null);
    setSelectedWindowId(null);
    setSelectedStairId(null);
    setSelectedLiftId(null);

    const handle =
      getRoomHandle(
        point,
        room
      );

    if (handle) {

      setRoomEditMode(
        handle
      );

    } else {

      setRoomEditMode(
        "move"
      );
    }

    roomEditStart.current = {

      point: {
        x: point.x,
        y: point.y
      },

      room: {
        ...room
      }
    };
  };

  /* ==================================================
     ROOM EDIT MOVE
  ================================================== */

  const moveSelectedRoom = (
    point
  ) => {

    const edit =
      roomEditStart.current;

    if (
      !edit ||
      !selectedRoomId
    ) {
      return;
    }

    const original =
      edit.room;

    const start =
      edit.point;

    const dx =
      point.x -
      start.x;

    const dy =
      point.y -
      start.y;

    updateCurrentFloor(
      (current) => {

        const updatedRooms =
          (current.rooms || [])
            .map(
              (room) => {

                if (
                  room.id !==
                  selectedRoomId
                ) {
                  return room;
                }

                /* MOVE */

                if (
                  roomEditMode ===
                  "move"
                ) {

                  return {

                    ...room,

                    x:
                      original.x +
                      dx,

                    y:
                      original.y +
                      dy
                  };
                }

                /* TOP LEFT */

                if (
                  roomEditMode ===
                  "resize-nw"
                ) {

                  let newX =
                    original.x +
                    dx;

                  let newY =
                    original.y +
                    dy;

                  let newWidth =
                    original.width -
                    dx;

                  let newHeight =
                    original.height -
                    dy;

                  if (
                    newWidth <
                    MIN_ROOM_SIZE
                  ) {

                    newWidth =
                      MIN_ROOM_SIZE;

                    newX =
                      original.x +
                      original.width -
                      MIN_ROOM_SIZE;
                  }

                  if (
                    newHeight <
                    MIN_ROOM_SIZE
                  ) {

                    newHeight =
                      MIN_ROOM_SIZE;

                    newY =
                      original.y +
                      original.height -
                      MIN_ROOM_SIZE;
                  }

                  return {

                    ...room,

                    x: newX,
                    y: newY,

                    width:
                      newWidth,

                    height:
                      newHeight
                  };
                }

                /* TOP RIGHT */

                if (
                  roomEditMode ===
                  "resize-ne"
                ) {

                  let newY =
                    original.y +
                    dy;

                  let newWidth =
                    original.width +
                    dx;

                  let newHeight =
                    original.height -
                    dy;

                  if (
                    newWidth <
                    MIN_ROOM_SIZE
                  ) {

                    newWidth =
                      MIN_ROOM_SIZE;
                  }

                  if (
                    newHeight <
                    MIN_ROOM_SIZE
                  ) {

                    newHeight =
                      MIN_ROOM_SIZE;

                    newY =
                      original.y +
                      original.height -
                      MIN_ROOM_SIZE;
                  }

                  return {

                    ...room,

                    y:
                      newY,

                    width:
                      newWidth,

                    height:
                      newHeight
                  };
                }

                /* BOTTOM LEFT */

                if (
                  roomEditMode ===
                  "resize-sw"
                ) {

                  let newX =
                    original.x +
                    dx;

                  let newWidth =
                    original.width -
                    dx;

                  let newHeight =
                    original.height +
                    dy;

                  if (
                    newWidth <
                    MIN_ROOM_SIZE
                  ) {

                    newWidth =
                      MIN_ROOM_SIZE;

                    newX =
                      original.x +
                      original.width -
                      MIN_ROOM_SIZE;
                  }

                  if (
                    newHeight <
                    MIN_ROOM_SIZE
                  ) {

                    newHeight =
                      MIN_ROOM_SIZE;
                  }

                  return {

                    ...room,

                    x:
                      newX,

                    width:
                      newWidth,

                    height:
                      newHeight
                  };
                }

                /* BOTTOM RIGHT */

                if (
                  roomEditMode ===
                  "resize-se"
                ) {

                  let newWidth =
                    original.width +
                    dx;

                  let newHeight =
                    original.height +
                    dy;

                  if (
                    newWidth <
                    MIN_ROOM_SIZE
                  ) {

                    newWidth =
                      MIN_ROOM_SIZE;
                  }

                  if (
                    newHeight <
                    MIN_ROOM_SIZE
                  ) {

                    newHeight =
                      MIN_ROOM_SIZE;
                  }

                  return {

                    ...room,

                    width:
                      newWidth,

                    height:
                      newHeight
                  };
                }

                return room;
              }
            );

        return {
          ...current,
          rooms:
            updatedRooms
        };
      }
    );
  };

  /* ==================================================
     ROOM EDIT FINISH
  ================================================== */

  const finishRoomEdit = () => {

    if (
      !roomEditStart.current ||
      !selectedRoomId
    ) {
      setRoomEditMode(null);
      return;
    }

    const original =
      roomEditStart.current.room;

    const currentRoom =
      rooms.find(
        (room) =>
          room.id ===
          selectedRoomId
      );

    if (!currentRoom) {
      setRoomEditMode(null);
      return;
    }

    const changed =
      original.x !== currentRoom.x ||
      original.y !== currentRoom.y ||
      original.width !==
        currentRoom.width ||
      original.height !==
        currentRoom.height;

    if (changed) {

      setHistory(
        (previous) => [
          ...previous,
          JSON.parse(
            JSON.stringify(
              mapData
            )
          )
        ]
      );

      setRedoHistory([]);
    }

    roomEditStart.current = null;
    setRoomEditMode(null);
  };

  /* ==================================================
     ROOM RENAME
  ================================================== */

  const renameRoom = (
    event,
    room
  ) => {

    event.stopPropagation();

    if (!isAdminMode) {
      return;
    }

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    const newName =
      window.prompt(
        "Enter new room name:",
        room.name
      );

    if (
      newName === null
    ) {
      return;
    }

    const cleaned =
      newName.trim();

    if (!cleaned) {
      return;
    }

    if (
      cleaned === room.name
    ) {
      return;
    }

    createHistoryPoint();

    updateCurrentFloor(
      (current) => ({
        ...current,

        rooms:
          (current.rooms || [])
            .map(
              (item) =>
                item.id ===
                room.id
                  ? {
                      ...item,
                      name:
                        cleaned
                    }
                  : item
            )
      })
    );

    setSelectedRoomId(
      room.id
    );
  };

  /* ==================================================
     WALL SELECTION
  ================================================== */

  const selectWall = (
    event,
    wallId
  ) => {

    event.stopPropagation();

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    clearSelection();

    setSelectedWallId(
      wallId
    );
  };

  /* ==================================================
     DOOR SELECTION
  ================================================== */

  const selectDoor = (
    event,
    doorId
  ) => {

    event.stopPropagation();

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    clearSelection();

    setSelectedDoorId(
      doorId
    );
  };

  /* ==================================================
     WINDOW SELECTION
  ================================================== */

  const selectWindow = (
    event,
    windowId
  ) => {

    event.stopPropagation();

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    clearSelection();

    setSelectedWindowId(
      windowId
    );
  };

  /* ==================================================
     STAIR SELECTION
  ================================================== */

  const selectStair = (
    event,
    stairId
  ) => {

    event.stopPropagation();

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    clearSelection();

    setSelectedStairId(
      stairId
    );
  };

  /* ==================================================
     LIFT SELECTION
  ================================================== */

  const selectLift = (
    event,
    liftId
  ) => {

    event.stopPropagation();

    if (
      activeTool !==
      "select"
    ) {
      return;
    }

    clearSelection();

    setSelectedLiftId(
      liftId
    );
  };

  /* ==================================================
     POINTER DOWN
  ================================================== */

  const handlePointerDown = (
    event
  ) => {

    event.preventDefault();

    // Normal users have no editor privileges. Their interaction is limited
    // to the navigation controls outside the editable map canvas.
    if (!isAdminMode) {
      return;
    }

    const point =
      getMapPoint(event);

    if (!point) {
      return;
    }

    /* NODE TOOL */

    if (
      activeTool ===
      "node"
    ) {

      placeNode(point);

      return;
    }

    /* ROOM TOOL */

    if (
      activeTool ===
      "room"
    ) {

      startRoom(point);

      return;
    }

    /* STAIR */

    if (
      activeTool ===
      "stair"
    ) {

      startStair(point);

      return;
    }

    /* LIFT */

    if (
      activeTool ===
      "lift"
    ) {

      placeLift(point);

      return;
    }

    /* DOOR */

    if (
      activeTool ===
      "door"
    ) {

      placeDoor(point);

      return;
    }

    /* WINDOW */

    if (
      activeTool ===
      "window"
    ) {

      placeWindow(point);

      return;
    }

    /* WALL */

    if (
      activeTool ===
      "wall"
    ) {

      let snapped =
        snapToEndpoint(
          point,
          walls
        );

      setIsDrawing(true);

      setStartPoint(
        snapped
      );

      setCurrentPoint(
        snapped
      );

      return;
    }
  };

  /* ==================================================
     POINTER MOVE
  ================================================== */

  const handlePointerMove = (
    event
  ) => {

    const point =
      getMapPoint(event);

    if (!point) {
      return;
    }

    /* ROOM CREATION */

    if (
      isDrawingRoom
    ) {

      moveRoom(point);

      return;
    }

    /* ROOM EDIT */

    if (
      roomEditMode &&
      selectedRoomId
    ) {

      moveSelectedRoom(
        point
      );

      return;
    }

    /* STAIR */

    if (
      isDrawingStair
    ) {

      moveStair(point);

      return;
    }

    /* WALL */

    if (
      isDrawing &&
      startPoint
    ) {

      let snapped =
        snapToEndpoint(
          point,
          walls
        );

      snapped =
        snapAngle(
          startPoint,
          snapped
        );

      setCurrentPoint(
        snapped
      );
    }
  };

  /* ==================================================
     POINTER UP
  ================================================== */

  const handlePointerUp = (
    event
  ) => {

    const point =
      getMapPoint(event);

    if (!point) {
      return;
    }

    /* ROOM CREATION */

    if (
      isDrawingRoom
    ) {

      finishRoom(point);

      return;
    }

    /* ROOM EDIT */

    if (
      roomEditMode
    ) {

      finishRoomEdit();

      return;
    }

    /* STAIR */

    if (
      isDrawingStair
    ) {

      finishStair(point);

      return;
    }

    /* WALL */

    if (
      !isDrawing ||
      !startPoint
    ) {
      return;
    }

    let end =
      snapToEndpoint(
        point,
        walls
      );

    end =
      snapAngle(
        startPoint,
        end
      );

    const dx =
      end.x -
      startPoint.x;

    const dy =
      end.y -
      startPoint.y;

    const distance =
      Math.sqrt(
        dx * dx +
        dy * dy
      );

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);

    if (
      distance < 5
    ) {
      return;
    }

    createHistoryPoint();

    const wall = {

      id:
        crypto.randomUUID(),

      type:
        "wall",

      start: {
        x:
          startPoint.x,

        y:
          startPoint.y
      },

      end: {
        x:
          end.x,

        y:
          end.y
      }
    };

    updateCurrentFloor(
      (current) => ({
        ...current,

        walls: [
          ...(current.walls || []),
          wall
        ]
      })
    );
  };

  /* ==================================================
     ROTATE STAIR
  ================================================== */

  const rotateSelectedStair = (
    amount
  ) => {

    if (
      !selectedStairId
    ) {
      return;
    }

    createHistoryPoint();

    updateCurrentFloor(
      (current) => ({
        ...current,

        stairs:
          (current.stairs || [])
            .map(
              (stair) => {

                if (
                  stair.id !==
                  selectedStairId
                ) {
                  return stair;
                }

                return {
                  ...stair,

                  rotation:
                    (
                      stair.rotation ||
                      0
                    ) +
                    amount
                };
              }
            )
      })
    );
  };

  /* ==================================================
     DELETE
  ================================================== */

  const deleteSelected = () => {

    if (!isAdminMode) {
      return;
    }

    if (
      selectedWallId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          walls:
            (current.walls || [])
              .filter(
                (wall) =>
                  wall.id !==
                  selectedWallId
              )
        })
      );

      setSelectedWallId(null);

      return;
    }

    if (
      selectedDoorId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          doors:
            (current.doors || [])
              .filter(
                (door) =>
                  door.id !==
                  selectedDoorId
              )
        })
      );

      setSelectedDoorId(null);

      return;
    }

    if (
      selectedWindowId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          windows:
            (current.windows || [])
              .filter(
                (item) =>
                  item.id !==
                  selectedWindowId
              )
        })
      );

      setSelectedWindowId(null);

      return;
    }

    if (
      selectedStairId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          stairs:
            (current.stairs || [])
              .filter(
                (item) =>
                  item.id !==
                  selectedStairId
              )
        })
      );

      setSelectedStairId(null);

      return;
    }

    if (
      selectedLiftId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          lifts:
            (current.lifts || [])
              .filter(
                (item) =>
                  item.id !==
                  selectedLiftId
              )
        })
      );

      setSelectedLiftId(null);

      return;
    }

    if (selectedConnectionId) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          connections:
            (current.connections || [])
              .filter(
                (connection) =>
                  connection.id !==
                  selectedConnectionId
              )
        })
      );

      setSelectedConnectionId(null);
      setRouteStartNodeId(null);
      setRouteEndNodeId(null);
      setRoutePath([]);
      setRouteDistance(null);

      return;
    }

    if (selectedNodeId) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          nodes:
            (current.nodes || [])
              .filter(
                (node) =>
                  node.id !==
                  selectedNodeId
              ),

          connections:
            (current.connections || [])
              .filter(
                (connection) =>
                  connection.from !==
                    selectedNodeId &&
                  connection.to !==
                    selectedNodeId
              )
        })
      );

      setSelectedNodeId(null);
      setRouteStartNodeId(null);
      setRouteEndNodeId(null);
      setRoutePath([]);
      setRouteDistance(null);

      return;
    }

    if (
      selectedRoomId
    ) {

      createHistoryPoint();

      updateCurrentFloor(
        (current) => ({
          ...current,

          rooms:
            (current.rooms || [])
              .filter(
                (room) =>
                  room.id !==
                  selectedRoomId
              )
        })
      );

      setSelectedRoomId(null);
    }
  };

  /* ==================================================
     KEYBOARD
  ================================================== */

  useEffect(() => {

    const handleKeyDown = (
      event
    ) => {

      if (!isAdminMode) {
        return;
      }

      if (
        event.key ===
          "Delete" ||
        event.key ===
          "Backspace"
      ) {

        deleteSelected();

        return;
      }

      if (
        event.key.toLowerCase() ===
        "r"
      ) {

        if (
          selectedStairId
        ) {

          rotateSelectedStair(
            event.shiftKey
              ? -15
              : 15
          );
        }
      }

      if (
        event.key ===
        "Escape"
      ) {

        setIsDrawing(false);
        setStartPoint(null);
        setCurrentPoint(null);

        setIsDrawingStair(false);
        setStairStartPoint(null);

        setIsDrawingRoom(false);
        setRoomStartPoint(null);
        setRoomCurrentPoint(null);

        setRoomEditMode(null);
        roomEditStart.current = null;
        setConnectingNodeId(null);

        setRouteStartNodeId(null);
        setRouteEndNodeId(null);
        setRoutePath([]);
        setRouteDistance(null);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };

  }, [
    selectedWallId,
    selectedDoorId,
    selectedWindowId,
    selectedStairId,
    selectedLiftId,
    selectedRoomId,
    selectedNodeId,
    selectedConnectionId,
    connectingNodeId,
    mapData,
    activeTool
  ]);

  /* ==================================================
     UNDO
  ================================================== */

  const undo = () => {

    if (!isAdminMode) {
      return;
    }

    if (
      history.length === 0
    ) {
      return;
    }

    const previous =
      history[
        history.length - 1
      ];

    setRedoHistory(
      (current) => [
        ...current,
        JSON.parse(
          JSON.stringify(
            mapData
          )
        )
      ]
    );

    setMapData(
      JSON.parse(
        JSON.stringify(
          previous
        )
      )
    );

    setHistory(
      (current) =>
        current.slice(
          0,
          -1
        )
    );

    clearSelection();
    setRouteStartNodeId(null);
    setRouteEndNodeId(null);
    setRoutePath([]);
    setRouteDistance(null);
  };

  /* ==================================================
     REDO
  ================================================== */

  const redo = () => {

    if (!isAdminMode) {
      return;
    }

    if (
      redoHistory.length === 0
    ) {
      return;
    }

    const next =
      redoHistory[
        redoHistory.length - 1
      ];

    setHistory(
      (current) => [
        ...current,
        JSON.parse(
          JSON.stringify(
            mapData
          )
        )
      ]
    );

    setMapData(
      JSON.parse(
        JSON.stringify(
          next
        )
      )
    );

    setRedoHistory(
      (current) =>
        current.slice(
          0,
          -1
        )
    );

    clearSelection();
    setRouteStartNodeId(null);
    setRouteEndNodeId(null);
    setRoutePath([]);
    setRouteDistance(null);
  };

  /* ==================================================
     IMAGE LOAD
  ================================================== */

  const handleImageLoad = (
    event
  ) => {

    const image =
      event.currentTarget;

    const nextSize = {
      width: image.naturalWidth,
      height: image.naturalHeight
    };

    setImageSize(nextSize);

    setFloorImageSizes((previous) => ({
      ...previous,
      [floor.id]: nextSize
    }));
  };

  /* ==================================================
     ROOM PREVIEW
  ================================================== */

  const roomPreview =
    isDrawingRoom &&
    roomStartPoint &&
    roomCurrentPoint
      ? getNormalizedRectangle(
          roomStartPoint,
          roomCurrentPoint
        )
      : null;

  /* ==================================================
     ALL FLOORS ROOM LIST
  ================================================== */

  const allRooms = Object.entries(mapData).flatMap(
    ([floorId, data]) =>
      (data.rooms || []).map((room) => ({
        ...room,
        floorId
      }))
  );

  /* ==================================================
     RENDER
  ================================================== */

  return (
    <div className="editor">

      <div className="navigation-header">
        <div className="navigation-brand">
          <div className="navigation-brand-mark">R</div>
          <div>
            <div className="navigation-brand-title">RSET Indoor Navigator</div>
            <div className="navigation-brand-subtitle">{floor.name}</div>
          </div>
        </div>

        <div className="navigation-header-actions">
          <div className={isAdminMode ? "mode-badge admin" : "mode-badge user"}>
            <span className="mode-dot" />
            {isAdminMode ? "Admin Mode" : "Navigation Mode"}
          </div>
          {isAdminMode ? (
            <button className="ios-button admin-exit-button" onClick={logoutAdmin}>
              Exit Admin
            </button>
          ) : (
            <button className="ios-button admin-login-button" onClick={openAdminLogin}>
              🔐 Admin
            </button>
          )}
        </div>
      </div>

      {isAdminMode && (
        <>
          <div className="admin-control-banner">🔐 Admin controls unlocked — all map editing, graph editing, saving, and calibration are restricted to Admin.</div>
      <Toolbar
        activeTool={
          activeTool
        }

        setActiveTool={
          (tool) => {
            triggerHaptic(7);

            setActiveTool(
              tool
            );

            clearSelection();

            setIsDrawing(false);
            setStartPoint(null);
            setCurrentPoint(null);

            setIsDrawingStair(false);
            setStairStartPoint(null);

            setIsDrawingRoom(false);
            setRoomStartPoint(null);
            setRoomCurrentPoint(null);

            setRoomEditMode(null);
            roomEditStart.current = null;
            setConnectingNodeId(null);

            setRouteStartNodeId(null);
            setRouteEndNodeId(null);
            setRoutePath([]);
            setRouteDistance(null);

            setRoomRouteStartId("");
            setRoomRouteEndId("");
            setRoomRoutePath([]);
            setRoomRouteDistance(null);
            setRoomRouteAccess(null);
          }
        }

        autoSaveEnabled={autoSaveEnabled}

        onToggleAutoSave={() => {
          setAutoSaveEnabled((previous) => !previous);
        }}

        autoSaveStatus={autoSaveStatus}

        onSave={saveMap}

        onUndo={undo}

        onRedo={redo}

        onDelete={deleteSelected}

        onHaptic={triggerHaptic}
      />
        </>
      )}

      <div className={isAdminMode ? "room-route-panel admin-route-panel" : "room-route-panel navigation-panel"}>
        <div className="room-route-heading">
          <div>
            <div className="room-route-title">Find a destination</div>
            <div className="room-route-subtitle">Choose a starting room and destination. Your route is shown in blue. Map editing is available only to Admin.</div>
          </div>
          <div className="navigation-live-pill">LIVE MAP</div>
        </div>

        <label>
          From
          <select
            value={roomRouteStartId}
            onChange={(event) => {
              setRoomRouteStartId(event.target.value);
              clearRoomRoute();
            }}
          >
            <option value="">Select starting room</option>
            {Object.entries(mapData).flatMap(([floorId, data]) =>
              (data.rooms || []).map((room) => (
                <option key={`${floorId}:${room.id}`} value={room.id}>
                  {room.name} ({FLOOR_ORDER.find((id) => id === floorId) || floorId})
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          To
          <select
            value={roomRouteEndId}
            onChange={(event) => {
              setRoomRouteEndId(event.target.value);
              clearRoomRoute();
            }}
          >
            <option value="">Select destination room</option>
            {Object.entries(mapData).flatMap(([floorId, data]) =>
              (data.rooms || []).map((room) => (
                <option key={`${floorId}:${room.id}`} value={room.id}>
                  {room.name} ({FLOOR_ORDER.find((id) => id === floorId) || floorId})
                </option>
              ))
            )}
          </select>
        </label>

        <button
          className="room-route-button"
          onClick={() => {
            triggerHaptic(12);
            findRoomRoute();
          }}
          disabled={
            !roomRouteStartId ||
            !roomRouteEndId ||
            Object.values(mapData).reduce(
              (total, data) => total + (data.rooms || []).length,
              0
            ) < 2
          }
        >
          Find Room Route
        </button>

        {roomRoutePath.length >= 1 && roomRouteDistance !== null && (
          <div className="room-route-result">
            <strong>Route found</strong>
            <span>
              {roomRouteDistance.toFixed(1)} map units
            </span>
            <span>
              {roomRoutePath.length} navigation nodes
            </span>
          </div>
        )}

        {roomRouteAccess && (
          <div className="room-route-access">
            <span>
              {roomRouteAccess.start.roomName} → {roomRouteAccess.start.nodeId === roomRouteAccess.end.nodeId ? "same node" : roomRouteAccess.end.roomName}
            </span>
          </div>
        )}

        {roomRoutePath.length > 0 && (
          <button
            className="room-route-clear"
            onClick={() => { triggerHaptic(8); clearRoomRoute(); }}
          >
            Clear Route
          </button>
        )}
      </div>

      <div className="map-editor-container">

        {!floor?.image && (
          <div className="loading-map">
            Floor plan not found.
          </div>
        )}

        {floor?.image && (

          <div
            className="map-stage"
            style={{
              aspectRatio:
                imageSize.width &&
                imageSize.height
                  ? `${imageSize.width} / ${imageSize.height}`
                  : "1 / 1"
            }}
          >

            {/* FLOOR PLAN */}

            <img
              ref={
                imageRef
              }

              src={
                floor.image
              }

              alt={
                floor.name
              }

              className="editor-floor-plan"

              onLoad={
                handleImageLoad
              }

              draggable={
                false
              }
            />

            {/* SVG */}

            <svg
              ref={
                svgRef
              }

              className="drawing-layer"

              viewBox={
                imageSize.width &&
                imageSize.height
                  ? `0 0 ${imageSize.width} ${imageSize.height}`
                  : "0 0 1000 1000"
              }

              preserveAspectRatio="none"

              onPointerDown={
                handlePointerDown
              }

              onPointerMove={
                handlePointerMove
              }

              onPointerUp={
                handlePointerUp
              }

              onPointerCancel={() => {

                setIsDrawing(false);
                setStartPoint(null);
                setCurrentPoint(null);

                setIsDrawingStair(false);
                setStairStartPoint(null);
                setCurrentPoint(null);

                setIsDrawingRoom(false);
                setRoomStartPoint(null);
                setRoomCurrentPoint(null);

                setRoomEditMode(null);
                roomEditStart.current = null;
              }}
            >

              {/* ==================================================
                  ROOMS
              ================================================== */}

              {rooms.map(
                (room) => {

                  const selected =
                    room.id ===
                    selectedRoomId;

                  return (

                    <g
                      key={
                        room.id
                      }

                      onPointerDown={
                        isAdminMode
                          ? (event) =>
                              startRoomEdit(
                                event,
                                room
                              )
                          : undefined
                      }

                      onDoubleClick={
                        (event) =>
                          renameRoom(
                            event,
                            room
                          )
                      }

                      style={{
                        cursor:
                          selected &&
                          activeTool ===
                            "select"
                            ? roomEditMode ===
                              "move"
                              ? "grabbing"
                              : "pointer"
                            : "pointer"
                      }}
                    >

                      {/* ROOM */}

                      <rect
                        x={
                          room.x
                        }

                        y={
                          room.y
                        }

                        width={
                          room.width
                        }

                        height={
                          room.height
                        }

                        fill={
                          selected
                            ? "rgba(37,99,235,0.25)"
                            : "rgba(59,130,246,0.14)"
                        }

                        stroke={
                          selected
                            ? "#2563eb"
                            : "#3b82f6"
                        }

                        strokeWidth={
                          selected
                            ? 4
                            : 2
                        }

                        strokeDasharray={
                          selected
                            ? "0"
                            : "8 5"
                        }
                      />

                      {/* LABEL BACKGROUND */}

                      <rect
                        x={
                          room.x +
                          room.width /
                            2 -
                          Math.min(
                            room.width /
                              2 -
                              5,
                            Math.max(
                              40,
                              room.name
                                .length *
                                4
                            )
                          )
                        }

                        y={
                          room.y +
                          room.height /
                            2 -
                          12
                        }

                        width={
                          Math.min(
                            room.width -
                              10,
                            Math.max(
                              80,
                              room.name
                                .length *
                                8
                            )
                          )
                        }

                        height="24"

                        rx="5"

                        fill="rgba(255,255,255,0.88)"

                        pointerEvents="none"
                      />

                      {/* LABEL */}

                      <text
                        x={
                          room.x +
                          room.width /
                            2
                        }

                        y={
                          room.y +
                          room.height /
                            2
                        }

                        textAnchor="middle"

                        dominantBaseline="middle"

                        fontSize="14"

                        fontWeight="600"

                        fill="#1f2937"

                        pointerEvents="none"
                      >
                        {
                          room.name
                        }
                      </text>

                      {/* ==================================================
                          RESIZE HANDLES
                      ================================================== */}

                      {selected &&
                        activeTool ===
                          "select" && (

                        <>

                          {/* NW */}

                          <rect
                            x={
                              room.x -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            y={
                              room.y -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            width={
                              ROOM_HANDLE_SIZE
                            }

                            height={
                              ROOM_HANDLE_SIZE
                            }

                            fill="#2563eb"

                            stroke="white"

                            strokeWidth="2"

                            style={{
                              cursor:
                                "nwse-resize"
                            }}
                          />

                          {/* NE */}

                          <rect
                            x={
                              room.x +
                              room.width -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            y={
                              room.y -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            width={
                              ROOM_HANDLE_SIZE
                            }

                            height={
                              ROOM_HANDLE_SIZE
                            }

                            fill="#2563eb"

                            stroke="white"

                            strokeWidth="2"

                            style={{
                              cursor:
                                "nesw-resize"
                            }}
                          />

                          {/* SW */}

                          <rect
                            x={
                              room.x -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            y={
                              room.y +
                              room.height -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            width={
                              ROOM_HANDLE_SIZE
                            }

                            height={
                              ROOM_HANDLE_SIZE
                            }

                            fill="#2563eb"

                            stroke="white"

                            strokeWidth="2"

                            style={{
                              cursor:
                                "nesw-resize"
                            }}
                          />

                          {/* SE */}

                          <rect
                            x={
                              room.x +
                              room.width -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            y={
                              room.y +
                              room.height -
                              ROOM_HANDLE_SIZE /
                                2
                            }

                            width={
                              ROOM_HANDLE_SIZE
                            }

                            height={
                              ROOM_HANDLE_SIZE
                            }

                            fill="#2563eb"

                            stroke="white"

                            strokeWidth="2"

                            style={{
                              cursor:
                                "nwse-resize"
                            }}
                          />

                        </>
                      )}

                    </g>
                  );
                }
              )}

              {/* ==================================================
                  ROOM CREATION PREVIEW
              ================================================== */}

              {roomPreview && (

                <rect
                  x={
                    roomPreview.x
                  }

                  y={
                    roomPreview.y
                  }

                  width={
                    roomPreview.width
                  }

                  height={
                    roomPreview.height
                  }

                  fill="rgba(59,130,246,0.12)"

                  stroke="#2563eb"

                  strokeWidth="2"

                  strokeDasharray="8 5"

                  pointerEvents="none"
                />

              )}

              {/* ==================================================
                  WALLS
              ================================================== */}

              {walls.map(
                (wall) => {

                  const selected =
                    wall.id ===
                    selectedWallId;

                  return (

                    <line
                      key={
                        wall.id
                      }

                      x1={
                        wall.start.x
                      }

                      y1={
                        wall.start.y
                      }

                      x2={
                        wall.end.x
                      }

                      y2={
                        wall.end.y
                      }

                      stroke={
                        selected
                          ? "#2563eb"
                          : "#111827"
                      }

                      strokeWidth={
                        selected
                          ? 7
                          : 5
                      }

                      strokeLinecap="round"

                      onClick={
                        (event) =>
                          selectWall(
                            event,
                            wall.id
                          )
                      }
                    />
                  );
                }
              )}

              {/* WALL PREVIEW */}

              {isDrawing &&
                startPoint &&
                currentPoint && (

                  <line
                    x1={
                      startPoint.x
                    }

                    y1={
                      startPoint.y
                    }

                    x2={
                      currentPoint.x
                    }

                    y2={
                      currentPoint.y
                    }

                    stroke="#2563eb"

                    strokeWidth="5"

                    strokeDasharray="10 6"

                    pointerEvents="none"
                  />

                )}

              {/* ==================================================
                  DOORS
              ================================================== */}

              {doors.map(
                (door) => {

                  const selected =
                    door.id ===
                    selectedDoorId;

                  return (

                    <g
                      key={
                        door.id
                      }

                      transform={`
                        translate(
                          ${door.x}
                          ${door.y}
                        )
                        rotate(
                          ${(door.rotation * 180) / Math.PI}
                        )
                      `}

                      onClick={
                        (event) =>
                          selectDoor(
                            event,
                            door.id
                          )
                      }
                    >

                      <rect
                        x={
                          -door.width /
                          2
                        }

                        y="-4"

                        width={
                          door.width
                        }

                        height="8"

                        fill={
                          selected
                            ? "#2563eb"
                            : "#16a34a"
                        }
                      />

                      <path
                        d={`
                          M ${-door.width / 2} 0
                          A ${door.width} ${door.width}
                          0 0 1
                          ${door.width / 2} ${door.width}
                        `}

                        fill="none"

                        stroke={
                          selected
                            ? "#2563eb"
                            : "#16a34a"
                        }

                        strokeWidth="2"

                        strokeDasharray="5 4"
                      />

                    </g>
                  );
                }
              )}

              {/* ==================================================
                  WINDOWS
              ================================================== */}

              {windows.map(
                (windowObject) => {

                  const selected =
                    windowObject.id ===
                    selectedWindowId;

                  return (

                    <g
                      key={
                        windowObject.id
                      }

                      transform={`
                        translate(
                          ${windowObject.x}
                          ${windowObject.y}
                        )
                        rotate(
                          ${(windowObject.rotation * 180) / Math.PI}
                        )
                      `}

                      onClick={
                        (event) =>
                          selectWindow(
                            event,
                            windowObject.id
                          )
                      }
                    >

                      <rect
                        x={
                          -windowObject.width /
                          2
                        }

                        y="-5"

                        width={
                          windowObject.width
                        }

                        height="10"

                        fill={
                          selected
                            ? "#2563eb"
                            : "#38bdf8"
                        }

                        stroke={
                          selected
                            ? "#1d4ed8"
                            : "#0284c7"
                        }

                        strokeWidth="2"
                      />

                    </g>
                  );
                }
              )}

              {/* ==================================================
                  STAIRS
              ================================================== */}

              {stairs.map(
                (stair) => {

                  const selected =
                    stair.id ===
                    selectedStairId;

                  const rotation =
                    (
                      stair.rotation *
                      180
                    ) /
                    Math.PI;

                  return (

                    <g
                      key={
                        stair.id
                      }

                      transform={`
                        translate(
                          ${stair.x}
                          ${stair.y}
                        )
                        rotate(
                          ${rotation}
                        )
                      `}

                      onClick={
                        (event) =>
                          selectStair(
                            event,
                            stair.id
                          )
                      }
                    >

                      <rect
                        x={
                          -stair.width /
                          2
                        }

                        y={
                          -stair.length /
                          2
                        }

                        width={
                          stair.width
                        }

                        height={
                          stair.length
                        }

                        fill={
                          selected
                            ? "rgba(245,158,11,0.35)"
                            : "rgba(245,158,11,0.22)"
                        }

                        stroke={
                          selected
                            ? "#2563eb"
                            : "#d97706"
                        }

                        strokeWidth={
                          selected
                            ? 4
                            : 2
                        }
                      />

                      {Array.from({
                        length: 8
                      }).map(
                        (_, index) => {

                          const y =
                            -stair.length /
                              2 +
                            8 +
                            index *
                              (
                                (
                                  stair.length -
                                  16
                                ) /
                                7
                              );

                          return (

                            <line
                              key={
                                index
                              }

                              x1={
                                -stair.width /
                                2 +
                                3
                              }

                              y1={
                                y
                              }

                              x2={
                                stair.width /
                                2 -
                                3
                              }

                              y2={
                                y
                              }

                              stroke="#92400e"

                              strokeWidth="1.5"
                            />
                          );
                        }
                      )}

                    </g>
                  );
                }
              )}

              {/* ==================================================
                  STAIR PREVIEW
              ================================================== */}

              {isDrawingStair &&
                stairStartPoint &&
                currentPoint && (

                  <g
                    transform={`
                      translate(
                        ${stairStartPoint.x}
                        ${stairStartPoint.y}
                      )
                      rotate(
                        ${(stairRotation * 180) / Math.PI}
                      )
                    `}

                    pointerEvents="none"
                  >

                    <rect
                      x={
                        -STAIR_WIDTH /
                        2
                      }

                      y={
                        -Math.max(
                          STAIR_LENGTH,
                          getDistance(
                            stairStartPoint,
                            currentPoint
                          )
                        ) / 2
                      }

                      width={
                        STAIR_WIDTH
                      }

                      height={
                        Math.max(
                          STAIR_LENGTH,
                          getDistance(
                            stairStartPoint,
                            currentPoint
                          )
                        )
                      }

                      fill="rgba(245,158,11,0.20)"

                      stroke="#d97706"

                      strokeWidth="2"

                      strokeDasharray="6 4"
                    />

                  </g>
                )}

              {/* ==================================================
                  LIFTS
              ================================================== */}

              {lifts.map(
                (lift) => {

                  const selected =
                    lift.id ===
                    selectedLiftId;

                  return (

                    <g
                      key={
                        lift.id
                      }

                      transform={`
                        translate(
                          ${lift.x + lift.width / 2}
                          ${lift.y + lift.height / 2}
                        )
                      `}

                      onClick={
                        (event) =>
                          selectLift(
                            event,
                            lift.id
                          )
                      }
                    >

                      <rect
                        x={
                          -lift.width /
                          2
                        }

                        y={
                          -lift.height /
                          2
                        }

                        width={
                          lift.width
                        }

                        height={
                          lift.height
                        }

                        rx="4"

                        fill={
                          selected
                            ? "rgba(37,99,235,0.35)"
                            : "rgba(14,165,233,0.28)"
                        }

                        stroke={
                          selected
                            ? "#2563eb"
                            : "#0284c7"
                        }

                        strokeWidth={
                          selected
                            ? 4
                            : 2
                        }
                      />

                      <rect
                        x="-16"
                        y="-18"
                        width="32"
                        height="36"
                        fill="none"
                        stroke="#0369a1"
                        strokeWidth="2"
                      />

                      <line
                        x1="-16"
                        y1="8"
                        x2="16"
                        y2="8"
                        stroke="#0369a1"
                        strokeWidth="2"
                      />

                    </g>
                  );
                }
              )}

              {/* ==================================================
                  NODE CONNECTIONS
              ================================================== */}

              {isAdminMode && connections.map((connection) => {
                const fromNode = nodes.find((node) => node.id === connection.from);
                const toNode = nodes.find((node) => node.id === connection.to);

                if (!fromNode || !toNode) return null;

                const selected = connection.id === selectedConnectionId;

                return (
                  <g key={connection.id}>
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="transparent"
                      strokeWidth="14"
                      onPointerDown={(event) => selectConnection(event, connection.id)}
                      style={{ cursor: activeTool === "select" ? "pointer" : "default" }}
                    />
                    <line
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke={selected ? "#2563eb" : "transparent"}
                      strokeWidth={selected ? CONNECTION_STROKE_WIDTH + 2 : CONNECTION_STROKE_WIDTH}
                      strokeDasharray={selected ? "0" : "8 5"}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}

              {/* ==================================================
                  ROOM-TO-ROOM ROUTE ACCESS
              ================================================== */}

              {roomRouteAccess && (
                <g pointerEvents="none">
                  {roomRouteAccess.start.floorId === floor.id && (
                    <>
                      <line
                        x1={roomRouteAccess.start.doorPoint.x}
                        y1={roomRouteAccess.start.doorPoint.y}
                        x2={roomRouteAccess.start.nodePoint.x}
                        y2={roomRouteAccess.start.nodePoint.y}
                        stroke="#2563eb"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray="10 6"
                      />
                      <circle
                        cx={roomRouteAccess.start.doorPoint.x}
                        cy={roomRouteAccess.start.doorPoint.y}
                        r="9"
                        fill="#2563eb"
                        stroke="white"
                        strokeWidth="3"
                      />
                    </>
                  )}

                  {roomRouteAccess.end.floorId === floor.id && (
                    <>
                      <line
                        x1={roomRouteAccess.end.doorPoint.x}
                        y1={roomRouteAccess.end.doorPoint.y}
                        x2={roomRouteAccess.end.nodePoint.x}
                        y2={roomRouteAccess.end.nodePoint.y}
                        stroke="#2563eb"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray="10 6"
                      />
                      <circle
                        cx={roomRouteAccess.end.doorPoint.x}
                        cy={roomRouteAccess.end.doorPoint.y}
                        r="9"
                        fill="#2563eb"
                        stroke="white"
                        strokeWidth="3"
                      />

                      {roomRouteAccess.end.roomCenter && (
                        <g
                          transform={`translate(${roomRouteAccess.end.roomCenter.x} ${roomRouteAccess.end.roomCenter.y})`}
                        >
                          {/* Google-Maps-style destination pin */}
                          <path
                            d="M 0 25 C -4 19 -15 10 -15 -2 A 15 15 0 1 1 15 -2 C 15 10 4 19 0 25 Z"
                            fill="#dc2626"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="0"
                            cy="-2"
                            r="5"
                            fill="white"
                          />
                          <circle
                            cx="0"
                            cy="-2"
                            r="2.5"
                            fill="#dc2626"
                          />
                          <text
                            x="0"
                            y="-25"
                            textAnchor="middle"
                            fill="#991b1b"
                            fontSize="12"
                            fontWeight="900"
                            paintOrder="stroke"
                            stroke="white"
                            strokeWidth="4"
                            strokeLinejoin="round"
                          >
                            DESTINATION
                          </text>
                        </g>
                      )}
                    </>
                  )}
                </g>
              )}

              {/* ==================================================
                  MULTI-FLOOR VERTICAL TRANSITIONS
              ================================================== */}

              {multiFloorRoute && multiFloorRoute.verticalTransitions.map((transition, index) => {
                const fromSeparator = transition.fromKey.indexOf(":");
                const toSeparator = transition.toKey.indexOf(":");
                const fromFloorId = transition.fromKey.slice(0, fromSeparator);
                const toFloorId = transition.toKey.slice(0, toSeparator);

                if (fromFloorId !== floor.id && toFloorId !== floor.id) {
                  return null;
                }

                const currentKey = floor.id === fromFloorId
                  ? transition.fromKey
                  : transition.toKey;
                const currentNodeId = currentKey.slice(floor.id.length + 1);
                const currentNode = nodes.find((node) => node.id === currentNodeId);
                if (!currentNode) return null;

                const connector = floor.id === transition.connector.fromFloor
                  ? transition.connector.fromItem
                  : transition.connector.toItem;
                const center = getObjectCenter(connector);

                return (
                  <g key={`vertical-route-${index}`} pointerEvents="none">
                    <line
                      x1={currentNode.x}
                      y1={currentNode.y}
                      x2={center.x}
                      y2={center.y}
                      stroke="#2563eb"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="8 5"
                    />
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r="12"
                      fill="#2563eb"
                      stroke="white"
                      strokeWidth="3"
                    />
                    <text
                      x={center.x + 16}
                      y={center.y - 12}
                      fill="#1d4ed8"
                      fontSize="12"
                      fontWeight="700"
                    >
                      {transition.type === "lift" ? "LIFT" : "STAIR"} → {floor.id === fromFloorId ? toFloorId : fromFloorId}
                    </text>
                  </g>
                );
              })}

              {/* ==================================================
                  ROOM ROUTE - DIJKSTRA GRAPH PATH
              ================================================== */}

              {roomRoutePath.length >= 2 && (
                <g pointerEvents="none">
                  {roomRoutePath.slice(0, -1).map((nodeId, index) => {
                    const fromNode = nodes.find(
                      (node) => node.id === nodeId
                    );

                    const toNode = nodes.find(
                      (node) => node.id === roomRoutePath[index + 1]
                    );

                    if (!fromNode || !toNode) {
                      return null;
                    }

                    return (
                      <line
                        key={`room-route-${nodeId}-${roomRoutePath[index + 1]}`}
                        x1={fromNode.x}
                        y1={fromNode.y}
                        x2={toNode.x}
                        y2={toNode.y}
                        stroke="#2563eb"
                        strokeWidth="10"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              )}

              {/* ==================================================
                  DIJKSTRA ROUTE
              ================================================== */}

              {routePath.length >= 2 && (
                <g pointerEvents="none">
                  {routePath.slice(0, -1).map((nodeId, index) => {
                    const fromNode = nodes.find(
                      (node) => node.id === nodeId
                    );

                    const toNode = nodes.find(
                      (node) => node.id === routePath[index + 1]
                    );

                    if (!fromNode || !toNode) {
                      return null;
                    }

                    return (
                      <line
                        key={`${nodeId}-${routePath[index + 1]}`}
                        x1={fromNode.x}
                        y1={fromNode.y}
                        x2={toNode.x}
                        y2={toNode.y}
                        stroke="#2563eb"
                        strokeWidth="10"
                        strokeLinecap="round"
                      />
                    );
                  })}
                </g>
              )}

              {/* ==================================================
                  NAVIGATION NODES
              ================================================== */}

              {isAdminMode && nodes.map(
                (node) => {

                  const selected =
                    node.id ===
                    selectedNodeId;

                  const isRouteStart =
                    node.id === routeStartNodeId;

                  const isRouteEnd =
                    node.id === routeEndNodeId;

                  const isRouteActive =
                    activeTool === "route" &&
                    routeStartNodeId === node.id &&
                    !routeEndNodeId;

                  return (

                    <g
                      key={node.id}

                      onPointerDown={
                        (event) =>
                          selectNode(
                            event,
                            node.id
                          )
                      }

                      style={{
                        cursor:
                          activeTool === "select" ||
                          activeTool === "connect" ||
                          activeTool === "route"
                            ? "pointer"
                            : "default"
                      }}
                    >

                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={
                          selected
                            ? NODE_SIZE + 2
                            : NODE_SIZE
                        }
                        fill={
                          isRouteEnd
                            ? "#dc2626"
                            : isRouteStart
                              ? "#2563eb"
                              : isRouteActive
                                ? "#f59e0b"
                                : selected
                                  ? "#2563eb"
                                  : "#64748b"
                        }
                        fillOpacity={selected || isRouteStart || isRouteEnd ? 0.72 : 0.16}
                        stroke="white"
                        strokeOpacity={selected ? 0.9 : 0.18}
                        strokeWidth="2"
                      />

                      <text
                        x={node.x}
                        y={
                          node.y -
                          NODE_SIZE -
                          5
                        }
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill={selected ? "#1d4ed8" : "#475569"}
                        fillOpacity={selected ? 0.9 : 0.16}
                        pointerEvents="none"
                      >
                        N
                      </text>

                    </g>
                  );
                }
              )}

            </svg>

          </div>
        )}
      </div>

      {/* ==================================================
          INFO BAR
      ================================================== */}

      <div className={isAdminMode ? "editor-info" : "editor-info user-info-bar"}>

        <strong>
          {floor.name}
        </strong>

        <span className="wall-count">
          Walls: {walls.length}
        </span>

        <span className="wall-count">
          Doors: {doors.length}
        </span>

        <span className="wall-count">
          Windows: {windows.length}
        </span>

        <span className="wall-count">
          Stairs: {stairs.length}
        </span>

        <span className="wall-count">
          Lifts: {lifts.length}
        </span>

        <span className="wall-count">
          Rooms: {rooms.length}
        </span>

        <span className="wall-count">
          Nodes: {nodes.length}
        </span>

        <span className="wall-count">
          Connections: {connections.length}
        </span>

        {selectedRoomId && (
          <span className="selected-info">
            Selected room
          </span>
        )}

        {roomEditMode ===
          "move" && (
          <span>
            Dragging room
          </span>
        )}

        {roomEditMode?.startsWith(
          "resize"
        ) && (
          <span>
            Resizing room
          </span>
        )}

        {activeTool ===
          "room" && (
          <span>
            Drag to create a room
          </span>
        )}

        {activeTool ===
          "node" && (
          <span>
            Click to place a navigation node at the exact clicked position
          </span>
        )}

        {activeTool ===
          "connect" && (
          <span>
            Click two nodes to create a navigation connection
          </span>
        )}

        {activeTool ===
          "select" && (
          <span>
            Double-click a room to rename
          </span>
        )}

        {roomRoutePath.length > 0 && roomRouteDistance !== null && (
          <span className="selected-info">
            Room route: {roomRouteDistance.toFixed(1)} map units
          </span>
        )}

        {activeTool === "route" && !routeStartNodeId && (
          <span>
            Click a node to choose the start point
          </span>
        )}

        {activeTool === "route" && routeStartNodeId && !routeEndNodeId && (
          <span>
            Start selected — click another node for the destination
          </span>
        )}

        {routePath.length >= 2 && routeDistance !== null && (
          <span className="selected-info">
            Route: {routePath.length} nodes · Distance: {routeDistance.toFixed(1)} map units
          </span>
        )}

      </div>


      {showAdminLogin && (
        <div className="admin-modal-backdrop" onPointerDown={() => setShowAdminLogin(false)}>
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-login-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-icon">🔐</div>
            <div className="admin-modal-title" id="admin-login-title">Admin access</div>
            <div className="admin-modal-subtitle">Map editing is restricted to administrators.</div>

            <input
              className="admin-password-input"
              type="password"
              value={adminPassword}
              autoFocus
              placeholder="Admin password"
              onChange={(event) => {
                setAdminPassword(event.target.value);
                setAdminLoginError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") loginAdmin();
              }}
            />

            {adminLoginError && (
              <div className="admin-login-error">{adminLoginError}</div>
            )}

            <div className="admin-modal-actions">
              <button className="ios-button secondary" onClick={() => setShowAdminLogin(false)}>Cancel</button>
              <button className="ios-button primary" onClick={loginAdmin}>Unlock Map</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default MapEditor;