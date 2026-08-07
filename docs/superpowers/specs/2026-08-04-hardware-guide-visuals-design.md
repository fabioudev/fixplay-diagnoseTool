# Hardware Guide Visuals Redesign - Design Spec
Date: 2026-08-04
Status: Approved (Blanket approval by user)

## 1. Goal
Upgrade the `HardwareGuide.svelte` visuals from basic diagrams to a "Technical Luxury" look: combining absolute technical precision (data-sheet quality) with haptic, realistic details (materials, depth, textures).

## 2. Visual Style: "Technical Luxury"
- **Overall Aesthetic**: High-contrast, dark-themed, clean lines, and professional typography.
- **Palette**:
  - Board: Deep Obsidian/Anthracite (`#0b0f1a`) with subtle edge glows.
  - Socket: Forest Green (`#14532d`) with metallic framing.
  - Components: Matte Charcoal with 1px highlight edges.
  - Accents: Amber (`#fbbf24`) for callouts and critical warnings.
  - Signals: Teal/Cyan for data lines.

## 3. Component Designs

### 3.1 Board Top-View (SVG)
- **Geometry**: Precise proportions of the black CH341A board.
- **Details**:
  - **ZIF Socket**: 24-pin green socket with a realistic pull-lever (gradient for roundness, drop-shadow for depth).
  - **Callouts**: 11 numbered orange circles with a subtle outer glow.
  - **USB Port**: Silver-grey metallic finish with inner depth.
  - **ICs**: CH341A and AMS1117 represented as 3D-like blocks via subtle gradients and highlights.
  - **Crystals/LEDs**: Accurate representation of the 12MHz crystal and power LED.
- **Callout Mapping**:
  1: USB, 2: ZIF lever, 3: ZIF socket, 4: CH341A IC, 5: AMS1117, 6: Crystal, 7: LED, 8: ACT# Jumper, 9: Mode Jumper, 10: Side Header, 11: NOR chip.

### 3.2 Chip Pinouts (SOIC-8 & SOIC-16)
- **Layout**:
  - **SOIC-8**: Pin 1 (dot) top-left. Left side: 1 $\rightarrow$ 4 (down). Right side: 8 $\rightarrow$ 5 (down).
  - **SOIC-16**: Pin 1 (dot) top-left. Left side: 1 $\rightarrow$ 8 (down). Right side: 16 $\rightarrow$ 9 (down).
- **Visuals**: Plastic body with a subtle gradient, high-contrast pin labels, and a clear pin-1 indicator.

### 3.3 ZIF Wiring Table
- **Mapping**: Clear table showing `Chip Pin` $\rightarrow$ `Signal` $\rightarrow$ `ZIF/CH341A`.
- **Emphasis**: Highlight the hard-wired VCC connections for #WP and #HOLD in amber to indicate they are inactive in the socket.

## 4. Implementation Details
- **Technology**: Pure SVG embedded in Svelte.
- **Responsiveness**: `viewBox` used for scaling; `max-width` and `shrink-0` for layout stability.
- **i18n**: All labels (Legend, Notes) managed via `typesafe-i18n`.
- **Tests**: Updated Vitest suite to assert the presence of new design elements and correct pin labeling.

## 5. Success Criteria
- No overlap between callouts and silkscreen text.
- Board layout matches a real CH341A black board.
- Pin numbering follows standard IC conventions.
- Visual style is consistent with the "Technical Luxury" theme.
