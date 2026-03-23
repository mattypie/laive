{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 5,
      "revision": 8,
      "architecture": "x64",
      "modernui": 1
    },
    "classnamespace": "box",
    "rect": [626.0, 235.0, 960.0, 640.0],
    "bglocked": 0,
    "openinpresentation": 1,
    "default_fontsize": 12.0,
    "default_fontface": 0,
    "default_fontname": "Arial",
    "gridonopen": 1,
    "gridsize": [15.0, 15.0],
    "gridsnaponopen": 1,
    "objectsnaponopen": 1,
    "statusbarvisible": 2,
    "toolbarvisible": 1,
    "lefttoolbarpinned": 0,
    "toptoolbarpinned": 0,
    "righttoolbarpinned": 0,
    "bottomtoolbarpinned": 0,
    "toolbars_unpinned_last_save": 0,
    "tallnewobj": 0,
    "boxanimatetime": 200,
    "enablehscroll": 1,
    "enablevscroll": 1,
    "devicewidth": 0.0,
    "description": "",
    "digest": "",
    "tags": "",
    "style": "",
    "subpatcher_template": "",
    "assistshowspatchername": 0,
    "boxes": [
      {
        "box": {
          "id": "obj-panel",
          "maxclass": "panel",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [24.0, 24.0, 520.0, 252.0],
          "presentation": 1,
          "presentation_rect": [24.0, 24.0, 520.0, 252.0],
          "bgcolor": [0.047, 0.055, 0.082, 1.0],
          "rounded": 18
        }
      },
      {
        "box": {
          "id": "obj-logo",
          "maxclass": "fpic",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [48.0, 40.0, 452.0, 155.0],
          "presentation": 1,
          "presentation_rect": [48.0, 40.0, 452.0, 155.0],
          "autofit": 1,
          "embed": 1,
          "pic": "../assets/logo.png"
        }
      },
      {
        "box": {
          "id": "obj-status",
          "linecount": 3,
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [48.0, 206.0, 452.0, 48.0],
          "presentation": 1,
          "presentation_rect": [48.0, 206.0, 452.0, 48.0],
          "fontname": "Arial Bold",
          "fontsize": 14.0,
          "textcolor": [0.92, 0.94, 0.98, 1.0],
          "text": "laive sidecar\nNode starts automatically. Wait for the loaded message before using workflows or test commands."
        }
      },
      {
        "box": {
          "id": "obj-fallback",
          "linecount": 9,
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [576.0, 40.0, 320.0, 170.0],
          "presentation": 1,
          "presentation_rect": [72.0, 72.0, 404.0, 116.0],
          "fontname": "Monaco",
          "fontsize": 10.0,
          "textcolor": [0.82, 0.86, 0.92, 1.0],
          "text": "             ,---.       .=-.-.       ,-.-.    ,----.  \n   _.-.    .--.'  \\\\     /==/_ /,--.-./=/ ,/ ,-.--` , \\\\ \n .-,.'|    \\\\==\\\\-/\\\\\\\\ \\\\   |==|, |/==/, ||=| -||==|-  _.-` \n|==|, |    /==/-|_\\\\ |  |==|  |\\\\==\\\\,  \\\\ / ,||==|   `.-. \n|==|- |    \\\\==\\\\,   - \\\\ |==|- | \\\\==\\\\ - ' - /==/_ ,    / \n|==|, |    /==/ -   ,| |==| ,|  \\\\==\\\\ ,   ||==|    .-'  \n|==|- `-._/==/-  /\\\\ - \\\\|==|- |  |==| -  ,/|==|_  ,`-._ \n/==/ - , ,|==\\\\ _.\\\\=\\\\.-'/==/. /  \\\\==\\\\  _ / /==/ ,     / \n`--`-----' `--`        `--`-`    `--`--'  `--`-----``"
        }
      },
      {
        "box": {
          "id": "obj-5",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 2,
          "outlettype": ["", ""],
          "patching_rect": [40.0, 320.0, 300.0, 22.0],
          "saved_object_attributes": {
            "autostart": 1,
            "defer": 0,
            "watch": 0
          },
          "text": "node.script ../code/laive-sidecar-node.js @autostart 1"
        }
      },
      {
        "box": {
          "id": "obj-6",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [356.0, 322.0, 220.0, 20.0],
          "text": "Node for Max runtime entrypoint"
        }
      },
      {
        "box": {
          "id": "obj-7",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "patching_rect": [40.0, 384.0, 128.0, 22.0],
          "text": "hello"
        }
      },
      {
        "box": {
          "id": "obj-8",
          "maxclass": "message",
          "numinlets": 2,
          "numoutlets": 1,
          "outlettype": [""],
          "patching_rect": [176.0, 384.0, 166.0, 22.0],
          "text": "list_workflows"
        }
      },
      {
        "box": {
          "id": "obj-9",
          "maxclass": "newobj",
          "numinlets": 1,
          "numoutlets": 0,
          "patching_rect": [40.0, 440.0, 124.0, 22.0],
          "text": "print laive-sidecar"
        }
      },
      {
        "box": {
          "id": "obj-10",
          "maxclass": "comment",
          "numinlets": 1,
          "numoutlets": 0,
          "linecount": 2,
          "patching_rect": [40.0, 480.0, 420.0, 34.0],
          "text": "Fallback banner uses the bundled assets/logo.txt art. The branded device view uses assets/logo.png when image rendering is available."
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "destination": ["obj-9", 0],
          "source": ["obj-5", 0]
        }
      },
      {
        "patchline": {
          "destination": ["obj-5", 0],
          "source": ["obj-7", 0]
        }
      },
      {
        "patchline": {
          "destination": ["obj-5", 0],
          "source": ["obj-8", 0]
        }
      }
    ],
    "dependency_cache": [
      {
        "name": "laive-sidecar-node.js",
        "patcherrelativepath": "../code",
        "type": "TEXT",
        "implicit": 1
      },
      {
        "name": "logo.png",
        "patcherrelativepath": "../assets",
        "type": "PNG ",
        "implicit": 1
      },
      {
        "name": "logo.txt",
        "patcherrelativepath": "../assets",
        "type": "TEXT",
        "implicit": 1
      }
    ],
    "autosave": 0
  }
}
