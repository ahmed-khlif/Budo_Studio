# BUDO Studio template customization

Each certificate model is saved in `template_presets.config`. The `fields` array contains every editable zone, including its position, size, source, and styling.

## Editor

1. Open **Éditeur de diplôme**.
2. Select a belt/model.
3. Double-click the preview or choose **＋ Nouvelle zone**.
4. Choose a data source or **Texte fixe personnalisé**.
5. Drag and resize the zone, or edit X, Y, width, and height.
6. Colors, fonts, direction, opacity, visibility, locking, and alignment are saved automatically.

## Preset API

```text
GET    /api/templates/presets
POST   /api/templates/presets
PUT    /api/templates/presets/:id
DELETE /api/templates/presets/:id
```

Example payload:

```json
{
  "name": "Yellow certificate custom layout",
  "belt": "أصفر",
  "description": "Custom certificate model",
  "config": {
    "version": 2,
    "belt": "أصفر",
    "size": { "width": 645.75, "height": 936.75 },
    "backgroundUrl": "https://res.cloudinary.com/example/image/upload/template.png",
    "fields": [
      {
        "id": "custom_title",
        "source": "custom",
        "label": "Certificate title",
        "sample": "شهادة حزام",
        "x": 322,
        "y": 250,
        "w": 420,
        "h": 70,
        "size": 42,
        "color": "#BD001C",
        "family": "Mirza",
        "weight": 700,
        "align": "center",
        "direction": "rtl",
        "visible": true,
        "locked": false,
        "opacity": 1,
        "rotation": 0,
        "letterSpacing": 0
      }
    ]
  }
}
```

The JSON configuration is intentionally extensible. New element properties can be added to `fields` without adding database columns.
