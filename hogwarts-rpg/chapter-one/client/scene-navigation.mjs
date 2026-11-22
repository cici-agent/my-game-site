import { getTrainNavigation } from '../train-layout.mjs';
// Shared collision layout exported from the rendered first-chapter environments.
// Tests compare every rendered wall with this table; changes must update both.
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const layouts = freeze({
  "SC00": {
    "bounds": [
      -7,
      7,
      -10,
      9.3
    ],
    "walls": [
      {
        "x": -5.3,
        "z": -6,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": -5.05,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": -1.4,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": -0.44999999999999996,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": 3.2,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": 4.15,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": 7.8,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": 8.75,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": -6,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": -5.05,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": -1.4,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": -0.44999999999999996,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": 3.2,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": 4.15,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": 7.8,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": 8.75,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      }
    ]
  },
  "SC01": {
    "bounds": [
      -7.8,
      7.8,
      -10,
      10
    ],
    "walls": [
      {
        "x": -5.4,
        "z": -7.9,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.4,
        "z": 4.1,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.4,
        "z": -7.9,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.4,
        "z": 4.1,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -7.25,
        "z": -1,
        "w": 1.18,
        "d": 0.65,
        "height": 1.1
      },
      {
        "x": 6.75,
        "z": 6,
        "w": 1.18,
        "d": 0.65,
        "height": 1.1
      },
      {
        "x": -6.7,
        "z": -7.6,
        "w": 1.18,
        "d": 0.65,
        "height": 1.1
      },
      {
        "x": -4.2,
        "z": 1.1,
        "w": 1.1,
        "d": 0.65,
        "height": 1.1
      },
      {
        "x": 4.3,
        "z": 5.6,
        "w": 1.1,
        "d": 0.65,
        "height": 0.65
      },
      {
        "x": 4.8,
        "z": -6.3,
        "w": 1.1,
        "d": 0.65,
        "height": 1.1
      }
    ]
  },
  "SC02": getTrainNavigation(),
  "SC03": {
    "bounds": [
      -10,
      10,
      -14,
      72
    ],
    "walls": [
      {
        "x": 0,
        "z": 21,
        "w": 25,
        "d": 48,
        "height": 5,
        "water": true
      },
      {
        "x": -7,
        "z": 16,
        "w": 7.2,
        "d": 61,
        "height": 5,
        "water": true
      },
      {
        "x": 7,
        "z": 16,
        "w": 7.2,
        "d": 61,
        "height": 5,
        "water": true
      }
    ]
  },
  "SC04": {
    "bounds": [
      -7,
      7,
      -10,
      9.3
    ],
    "walls": [
      {
        "x": -5.3,
        "z": -6,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": -5.05,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": -1.4,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": -0.44999999999999996,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": 3.2,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": 4.15,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": -5.3,
        "z": 7.8,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -5.3,
        "z": 8.75,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": -6,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": -5.05,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": -1.4,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": -0.44999999999999996,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": 3.2,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": 4.15,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      },
      {
        "x": 5.3,
        "z": 7.8,
        "w": 3.8,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 5.3,
        "z": 8.75,
        "w": 2.12,
        "d": 0.6,
        "height": 1.2
      }
    ]
  },
  "SC05": {
    "bounds": [
      -6.3,
      6.3,
      -8.3,
      8.4
    ],
    "walls": [
      {
        "x": -4.5,
        "z": -5.8,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -4.5,
        "z": -4.8999999999999995,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": -1.6,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -4.5,
        "z": -0.7000000000000001,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": 2.6,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -4.5,
        "z": 3.5,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": 6.8,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": -4.5,
        "z": 7.7,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": -5.8,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 4.5,
        "z": -4.8999999999999995,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": -1.6,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 4.5,
        "z": -0.7000000000000001,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": 2.6,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 4.5,
        "z": 3.5,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": 6.8,
        "w": 2.35,
        "d": 1,
        "height": 0.94
      },
      {
        "x": 4.5,
        "z": 7.7,
        "w": 2.12,
        "d": 0.56,
        "height": 1.1
      }
    ]
  },
  "SC06": {
    "bounds": [
      -6.3,
      6.3,
      -9.65,
      9
    ],
    "walls": []
  },
  "SC07": {
    "bounds": [
      -6.7,
      6.7,
      -9.7,
      9.2
    ],
    "walls": [
      {
        "x": -5.8,
        "z": -6,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": -5.8,
        "z": -1.3,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": -5.8,
        "z": 3.4,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": -5.8,
        "z": 8.1,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": 5.8,
        "z": -6,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": 5.8,
        "z": -1.3,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": 5.8,
        "z": 3.4,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": 5.8,
        "z": 8.1,
        "w": 0.87,
        "d": 4.12,
        "height": 4.5
      },
      {
        "x": 3.9,
        "z": -3.7,
        "w": 2.18,
        "d": 1,
        "height": 0.94
      }
    ]
  },
  "SC08": {
    "bounds": [
      -10,
      10,
      -14,
      12
    ],
    "walls": [
      {
        "x": -4.5,
        "z": -8,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": -4,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": 0,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": 4,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": -4.5,
        "z": 8,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": -8,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": -4,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": 0,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": 4,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      },
      {
        "x": 4.5,
        "z": 8,
        "w": 2.6,
        "d": 1.4,
        "height": 1.1
      }
    ]
  },
  "SC09": {
    "bounds": [
      -10,
      10,
      -14,
      12
    ],
    "walls": []
  },
  "SC10": {
    "bounds": [
      -5.3,
      5.3,
      -8.6,
      8.4
    ],
    "walls": [
      {
        "x": -4.4,
        "z": -6.5,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": -4.4,
        "z": 1.25,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": -4.4,
        "z": 6.7,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": -6.5,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": 1.25,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": 6.7,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 1.06,
        "z": -4.4,
        "w": 1.35,
        "d": 0.23,
        "height": 1.83
      }
    ]
  },
  "SC11": {
    "bounds": [
      -10,
      10,
      -14,
      12
    ],
    "walls": []
  },
  "SC12": {
    "bounds": [
      -10,
      10,
      -14,
      12
    ],
    "walls": [
      {
        "shape": "circle",
        "x": -4,
        "z": 10,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -6.2,
        "z": 7.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -8.4,
        "z": 5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -4,
        "z": 2.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -6.2,
        "z": 0,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -8.4,
        "z": -2.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -4,
        "z": -5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -6.2,
        "z": -7.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -8.4,
        "z": -10,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": -4,
        "z": -12.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 4,
        "z": 10,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 6.2,
        "z": 7.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 8.4,
        "z": 5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 4,
        "z": 2.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 6.2,
        "z": 0,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 8.4,
        "z": -2.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 4,
        "z": -5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 6.2,
        "z": -7.5,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 8.4,
        "z": -10,
        "radius": 0.28,
        "height": 6
      },
      {
        "shape": "circle",
        "x": 4,
        "z": -12.5,
        "radius": 0.28,
        "height": 6
      }
    ]
  },
  "SC13": {
    "bounds": [
      -6.3,
      6.3,
      -9.7,
      9
    ],
    "walls": [
      {
        "x": -5.94,
        "z": -6,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      },
      {
        "x": -5.94,
        "z": -1.2,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      },
      {
        "x": -5.94,
        "z": 4.9,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      },
      {
        "x": 5.94,
        "z": -6,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      },
      {
        "x": 5.94,
        "z": -1.2,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      },
      {
        "x": 5.94,
        "z": 4.9,
        "w": 1.22,
        "d": 1.44,
        "height": 1.07
      }
    ]
  },
  "SC14": {
    "bounds": [
      -5.3,
      5.3,
      -8.6,
      8.4
    ],
    "walls": [
      {
        "x": -4.4,
        "z": -6.5,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": -4.4,
        "z": 1.25,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": -4.4,
        "z": 6.7,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": -6.5,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": 1.25,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 4.4,
        "z": 6.7,
        "w": 0.65,
        "d": 2.1,
        "height": 1.1
      },
      {
        "x": 1.06,
        "z": -4.4,
        "w": 1.35,
        "d": 0.23,
        "height": 1.83
      }
    ]
  },
  "SC15": {
    "bounds": [
      -5.2,
      5.2,
      -9,
      8.8
    ],
    "walls": [
      {
        "x": -4.4,
        "z": -6.5,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      },
      {
        "x": -4.4,
        "z": 1.25,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      },
      {
        "x": -4.4,
        "z": 6.7,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      },
      {
        "x": 4.4,
        "z": -6.5,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      },
      {
        "x": 4.4,
        "z": 1.25,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      },
      {
        "x": 4.4,
        "z": 6.7,
        "w": 1.12,
        "d": 2.02,
        "height": 0.9
      }
    ]
  }
});
export function getSceneNavigation(sceneId, {arena} = {}) {
  if (arena) return {bounds:[arena.bounds.minX,arena.bounds.maxX,arena.bounds.minZ,arena.bounds.maxZ],walls:arena.obstacles.map(o=>({...o,height:o.height??3}))};
  if (!Object.hasOwn(layouts,sceneId)) throw new Error('UNKNOWN_SCENE_NAVIGATION:'+sceneId);
  return layouts[sceneId];
}
export const sceneNavigationIds = Object.freeze(Object.keys(layouts));
