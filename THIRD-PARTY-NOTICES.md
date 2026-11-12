# Fremde Bestandteile (Third-Party Notices)

Circle Champ steht unter der MIT-Lizenz (siehe `LICENSE`). Die folgenden Teile stammen aus
anderen Projekten und behalten ihre eigene Lizenz.

## Körpergrafik: react-native-body-highlighter

- Quelle: https://github.com/HichamELBSI/react-native-body-highlighter
  (Commit `8ed39ac2ae9cb46fb79d77eedec7e5b029a75174`)
- Übernommen: die SVG-Pfaddaten der männlichen Figur von vorne und hinten samt Umriss, als
  `js/data/body.js`. Umgewandelt mit `tools/make-body.mjs` (linke und rechte Hälfte je Region
  zusammengeführt, Bildausschnitt auf die Figur beschnitten). Der React-Code des Projekts wird
  nicht verwendet.
- Lizenz: MIT

```
MIT License

Copyright (c) 2022 ELABBASSI Hicham

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Titelschrift der Designs: Bangers

- Quelle: https://github.com/googlefonts/bangers, Datei aus https://github.com/google/fonts (Ordner `ofl/bangers`)
- Übernommen: `fonts/Bangers-Regular.ttf`, unverändert. Wird nur geladen, wenn ein Design außer "Standard" gewählt ist.
- Lizenz: SIL Open Font License 1.1, Copyright 2010 The Bangers Project Authors. Voller Text: `fonts/OFL-Bangers.txt`.

## Porträts der Designs Flammen, Ninja, Wildnis und Donner

- Dateien: `img/portraits/*.webp`
- Entstanden mit einem KI-Bildgenerator (ChatGPT von OpenAI) nach eigenen Textbeschreibungen für diese
  App, danach zugeschnitten und verkleinert. Die Figuren sind erfunden und stellen keine Figur aus einer
  Serie oder einem Spiel dar. Die Nutzungsrechte richten sich nach den Bedingungen des verwendeten
  Dienstes zum Zeitpunkt der Erzeugung (November 2026).
