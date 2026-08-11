/* =========================================================
   Research — three themes, eight projects.

   Ported from the 2D site (portfolio/index.html, #works). Kept at
   theme granularity on entry, matching the accordion there: the
   three themes are what you see, the projects unfold from them.

   `media` is either a YouTube id (an atlas tile plus a hero clip)
   or { image } for the one project that never had a video.
   ========================================================= */

export const WORKS = [
  {
    key: "echo",
    eyebrow: "Theme 01",
    title: "AR Echography",
    desc:
      "A line of research that supports echography with AR — overlaying anatomy, probe pose, and procedural memory to help unskilled or remote operators.",
    cover: "Dpuc243qCzw",
    projects: [
      {
        id: "Dpuc243qCzw",
        title: "Internal Organ Overlay",
        desc:
          "Pre-recorded organ shape and probe pose from a skilled physician are visualized to help unskilled physicians acquire echograms.",
      },
      {
        id: "zI8S49qpiOs",
        title: "HMD Cross-Section Overlay",
        desc:
          "The ultrasound cross section is superimposed onto the view of a physician wearing HoloLens or Magic Leap, built on markerless tracking and real-time pose/image streaming.",
      },
      {
        id: "GY3UlelftKU",
        title: "Remote Instruction",
        desc:
          "A remote doctor instructs probe operation through AR. Operation transfer was achieved with visual information alone.",
      },
      {
        id: "l4UIc49jXsM",
        title: "Dynamic Body Mark",
        desc:
          "Volumetric video records and visualizes the echography procedure — useful both as a medical-skill archive and for tele-collaboration.",
      },
    ],
  },
  {
    key: "motion",
    eyebrow: "Theme 02",
    title: "Wearable Motion Sensing",
    desc:
      "Motion sensing for sports and rehabilitation, built from wearable IMU, EMG and camera sensors.",
    cover: "iHlOLLHfhds",
    projects: [
      {
        id: "iHlOLLHfhds",
        title: "IMU + SLAM Motion Capture",
        desc:
          "IMUs capture joint angles without occlusion; a SLAM sensor tracks body position in space. Also applied to full-body tracking and sports sensing.",
      },
      {
        id: "pULDFD-bDgE",
        title: "Rehabilitation Game",
        desc:
          "A rehabilitation game that turns hand training into play — a character moves forward while the patient holds their arm horizontal, and steers by tilting the hand.",
      },
    ],
  },
  {
    key: "collab",
    eyebrow: "Theme 03",
    title: "Collaborative Research",
    desc: "Joint projects with medical and civil-engineering research groups.",
    cover: "pPT0RLVDzZA",
    projects: [
      {
        id: "pPT0RLVDzZA",
        title: "Radiation Visualization",
        partner: "Kyushu Univ. (Fujibuchi Lab)",
        desc:
          "A medical training app that visualizes invisible radiation distributions in AR and quantifies staff exposure relative to emitting devices.",
      },
      {
        id: "chuo-univ",
        title: "Underground Utility AR",
        partner: "Chuo Univ. (Kashiyama Lab)",
        desc:
          "Co-developed AR applications that visualize underground utilities such as pipelines beneath roads, helping prevent accidents during road construction.",
        image: "./media/img/chuo-univ.jpg",
      },
    ],
  },
];

/** Flat list of every research project, in theme order. */
export const WORK_PROJECTS = WORKS.flatMap((theme) =>
  theme.projects.map((p) => ({ ...p, themeKey: theme.key, themeTitle: theme.title }))
);
