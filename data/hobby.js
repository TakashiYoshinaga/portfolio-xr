/* =========================================================
   Prototypes — 22 items, ported verbatim from the 2D site's HOBBY
   array (portfolio/script.js). `id` is the YouTube id and doubles
   as the key for the atlas tile and hero clip.

   The first FEATURED items are what appears on entry; the rest are
   revealed by the "+N MORE" cap, mirroring the 2D site's More/Less
   toggle. The four-way tag vocabulary drives the tag rail — the 2D
   site carries these tags but never surfaces them.
   ========================================================= */

export const FEATURED = 8;

export const HOBBY = [
  { id: "57gkK-xGxKQ", title: "Snap2VoxelAR", tags: ["ar", "ai"],
    desc: "Turns a quick real-world capture into voxel-style 3D content and brings it back into the room as an AR object — a playful bridge between physical snapshots and editable spatial blocks." },
  { id: "5nlFjTWZSE8", title: "Turn Your Memories into 3D Gaussian Splatting", tags: ["ai", "ar"],
    desc: "Transforms personal memories into a 3D Gaussian Splatting scene, letting captured moments become navigable volumetric spaces for XR viewing and spatial storytelling." },
  { id: "ZE_F2NsOSfQ", title: "Project HoloBox", tags: ["ar", "vr"],
    desc: "Achieves a 3D perspective effect on an iPad without a dedicated display, and lets the virtual world inside the iPad interact with HoloLens 2 and other AR devices." },
  { id: "JnxXkK8pQ2Q", title: "Reality Portal", tags: ["vr", "sensor"],
    desc: "Syncs a real-world door with its virtual portal representation. By aligning physical and virtual objects, the prototype explores more immersive mixed-reality experiences." },
  { id: "aFJR6CnUeqs", title: "StickAR", tags: ["vr", "ai"],
    desc: "A Quest app that captures any visible text — handwritten or on screen — and turns it into a hand-grabbable AR sticky note. Toss the note at a real PC monitor to paste the recognized text into the active window." },
  { id: "dkM1WFAXtDg", title: "Real-World Lighting", tags: ["vr", "sensor"],
    desc: "Reflects real-world lighting conditions on Meta Quest. Position and shape data of real objects is streamed to the Quest via WebSocket or WebRTC." },
  { id: "525E8wxZyxM", title: "Shake-to-Send", tags: ["ar", "sensor"],
    desc: "A shake gesture detected by a smartphone's accelerometer triggers sending 2D/3D images to HoloLens. Inspired by interfaces from SF movies." },
  { id: "j2GieSCbeIg", title: "HoloTuberKit", tags: ["ar", "sensor"],
    desc: "Broadcasts point clouds over the internet and visualizes them on XR devices. Viewer apps for HoloLens, Nreal Light, Meta Quest and ARCore — available on GitHub." },
  { id: "zSK1FuUiQSo", title: "Volumetric Telepresence", tags: ["ar", "vr"],
    desc: "Remote communication based on volumetric video streaming. Users meet remotely while sharing and manipulating 2D images, videos, and 3D models." },
  { id: "vZnM_0YjJ24", title: "AR Fireworks", tags: ["ar"],
    desc: "An iPad is used as a controller to place the fireworks origin in real space; HoloLens 2 is the AR viewer. Lets users intuitively place and experience fireworks in their environment." },
  { id: "YgYVepT3xEs", title: "Depth Masked Spray", tags: ["vr", "sensor"],
    desc: "Uses Meta Quest 3's depth data so real-world objects act as masks for virtual spray painting — spray patterns respect physical shape and position." },
  { id: "vnuHLrYknt0", title: "Mobile Scan to XR", tags: ["ar"],
    desc: "Transfers 3D objects scanned by a smartphone to XR devices, enabling sharing of 3D objects with people in remote locations as long as there is an internet connection." },
  { id: "Jb8YrRuD168", title: "Finger Frame Window", tags: ["ar", "sensor"],
    desc: "Sees a remote environment through a finger frame. Leap Motion detects the gesture and adjusts the size of an AR window displayed on Meta 2." },
  { id: "kau5hRnEGdI", title: "DejaViewer", tags: ["vr", "sensor"],
    desc: "Uses Meta Quest 3's depth data and color camera input to instantly record and replay the shape and motion of objects in front of the user." },
  { id: "CICZqMf9QwA", title: "Half-Mirror AR", tags: ["ar"],
    desc: "A test of half-mirror AR with hand–character interaction. This style of AR makes it easier — especially for children — to experience optical see-through AR without wearing an HMD." },
  { id: "7-Z8c2pjJQc", title: "Spatial Clipper", tags: ["ar", "sensor"],
    desc: "Extracts a spatial mesh within a clipping sphere and can transmit it to other devices — enabling hands-free scanning and sharing of geometry with remote users." },
  { id: "K34p7RwjWt0", title: "EMG AR Shooter", tags: ["ar", "sensor"],
    desc: "An AR shooter using HoloLens 2 and an EMG sensor. A virtual bullet fires when the user strongly clenches their hand — enabling interactions that pure image processing cannot." },
  { id: "brWvzuRAXgU", title: "Wall Touch Panel", tags: ["sensor", "ar"],
    desc: "Turns a flat wall into a touch panel using depth and image processing. Demonstrates a virtual peephole that lets users look into the next room via a web camera." },
  { id: "b02gry-nvyM", title: "ChatGPT × AR", tags: ["ai", "ar"],
    desc: "3D objects generated by ChatGPT are displayed in AR. Instead of a virtual keyboard, AI-based character recognition is used for prompt input — enabling more intuitive interaction." },
  { id: "8ZfWHPwKC5c", title: "Multi-User AR", tags: ["ar"],
    desc: "Shares an AR experience across multiple users and devices. Both virtual objects and user operations are synchronized between HoloLens users and a recording smartphone." },
  { id: "qXd_yPjMYoU", title: "Real-time AR Coloring", tags: ["ar"],
    desc: "Recognizes a square frame to clip the coloring area, then visualizes the textured object on AR devices. Works on HoloLens, ARCore devices, Aryzon, and Looking Glass." },
  { id: "KpenTQ6t6-g", title: "LiDAR Spatial Sync", tags: ["sensor", "ar"],
    desc: "Scans the environment with iPad/iPhone LiDAR and links real and virtual worlds — an avatar from the virtual side appears in the real room, and object placement is synced both ways." },
];

export const TAGS = ["ar", "vr", "ai", "sensor"];
