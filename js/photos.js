/* ==========================================================================
   ulyOS · js/photos.js — real photograph wallpapers
   Genuine photographs, none of them stored in ulyOS: each is fetched on demand
   from Wikimedia Commons as a resized copy, only after you open the list or
   pick one. Every file below was checked on Commons (licence field) as Public
   domain (NASA, NOAA, US National Park Service) or CC0, so there are no
   attribution or redistribution conditions. Several CC0 files originate from
   Unsplash and were released as CC0 by their uploaders on Commons.
   ========================================================================== */
(function () {
  'use strict';
  if (!ulyOS.landscapes) return;
  const L = ulyOS.landscapes;
  L.groups = [['Nature & landscapes', L.list.slice()]];   // the drawn nature scenes (offline, built in)
  const P = (key, label, file, credit, group) => ({ key, label, file, credit, group });
  L.photos = [
    P('city-lights', 'City of lights', 'City of lights (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('manhattan', 'Manhattan in the distance', 'Manhattan in the distance (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('gw-bridge', 'George Washington Bridge', 'George Washington Bridge (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('skyline-water', 'Skyline over water', 'Bright skyline over water (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('city-docks', 'City from the docks', 'City from docks at night (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('guangzhou', 'Guangzhou at night', 'Guangzhou at night - 2017.jpg', 'Wikimedia Commons · CC0', 'Cities & lights'),
    P('neon-streets', 'Neon streets', 'Neon streets (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('purple-night', 'Purple night', 'Purple night (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('futuristic-facade', 'Futuristic facade', 'Futuristic facade (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('arts-sciences', 'City of Arts and Sciences', 'City of Arts and Sciences (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Cities & lights'),
    P('mist-dusk', 'Misty forest at dusk', 'Misty forest at dusk (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('mist-mountains', 'Misty mountains', 'Misty Mountains (Unsplash zR40wedS1aQ).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('mist-conifer', 'Misty conifer slope', 'Misty coniferous forest on a slope (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('mist-morning', 'Misty morning', 'Misty Mornings (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('still-waters', 'Still waters by the mountains', 'Still waters by the mountains (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('aoraki', 'Aoraki sunrise', 'Aoraki Sunrise (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('agung', 'Mount Agung sunrise', 'Mount Agung Sunrise (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('alaska-road', 'Road along Alaska mountains', 'Road along Alaska mountains (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('carmel', 'Carmel coastline', 'Carmel by the Sea Coastline (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Forests, mountains & coast'),
    P('palm-coast', 'Ocean waves from above', 'Ocean waves drone view of Palm Coast beach.jpg', 'Wikimedia Commons · CC0', 'Forests, mountains & coast'),
    P('schooner-gulch', 'Schooner Gulch sunset', 'Schooner Gulch State Beach Sunset (37209287561).jpg', 'NOAA · public domain', 'Forests, mountains & coast'),
    P('lights-tromso', 'Northern lights, Tromsø', 'Green Northern Lights Tromsø (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Aurora & night sky'),
    P('lights-iceland', 'Northern lights above Iceland', 'Northern Lights above Iceland (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Aurora & night sky'),
    P('lights-lake', 'Iceland lake aurora', 'Iceland lake Northern Lights (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Aurora & night sky'),
    P('reflecting-sky', 'Reflecting the sky', 'Reflecting the sky (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Aurora & night sky'),
    P('milkyway-fjord', 'Milky Way over a fjord', 'Stars and Milky Way over Åbyfjorden 1.jpg', 'Wikimedia Commons · CC0', 'Aurora & night sky'),
    P('milkyway-brofjord', 'Milky Way, Brofjorden', 'Milky Way over Brofjorden as seen from Sandvik 5.jpg', 'Wikimedia Commons · CC0', 'Aurora & night sky'),
    P('desert-night', 'Clear desert night sky', 'Clear Desert Night Sky (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Aurora & night sky'),
    P('desert-skies', 'Desert skies', 'Desert Skies (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Desert & canyon'),
    P('dunes-nm', 'Dunes in New Mexico', 'Desert Dunes in New Mexico (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Desert & canyon'),
    P('muscat', 'Muscat desert sunset', 'Muscat desert sunset (Unsplash).jpg', 'Wikimedia Commons · CC0 (uploaded from Unsplash)', 'Desert & canyon'),
    P('gc-kolb', 'Grand Canyon, Kolb Studio sunset', 'Grand Canyon National Park, Kolb Studio Sunset 0131 (2010) - Flickr - Grand Canyon NPS.jpg', 'US National Park Service · public domain', 'Desert & canyon'),
    P('gc-powell', 'Grand Canyon, Powell Point sunset', 'Grand Canyon National Park, Powell Point Sunset Feb.10, 2013 1516 - Flickr - Grand Canyon NPS.jpg', 'US National Park Service · public domain', 'Desert & canyon'),
    P('gc-storm', 'Grand Canyon thunderstorm', 'Grand Canyon National Park — Summer Thunderstorm 70367 (51441851059).jpg', 'US National Park Service · public domain', 'Desert & canyon'),
    P('saturn-equinox', 'Saturn at equinox', 'Saturn during Equinox.jpg', 'NASA/JPL-Caltech/Cassini · public domain', 'Space (NASA)'),
    P('saturn-cassini', 'Saturn from Cassini', 'Saturn from Cassini Orbiter (2004-10-06).jpg', 'NASA/JPL/Cassini · public domain', 'Space (NASA)'),
    P('saturn-farewell', 'A farewell to Saturn', 'PIA17218 – A Farewell to Saturn, Brightened Version.jpg', 'NASA/JPL-Caltech/Cassini · public domain', 'Space (NASA)'),
    P('saturn-eclipse', 'Saturn eclipse', 'Saturn eclipse.jpg', 'NASA/JPL/Cassini · public domain', 'Space (NASA)'),
    P('saturn-rings', 'Rings of Saturn', 'Top view of the rings of Saturn by Cassini - October 10, 2013.jpg', 'NASA/JPL/Cassini · public domain', 'Space (NASA)'),
    P('jupiter-grs', 'Jupiter, Great Red Spot', 'PIA00022 Jupiter Great Red Spot Mosaic.jpg', 'NASA/JPL · public domain', 'Space (NASA)'),
    P('pillars', 'Pillars of Creation', 'Pillars of creation 2014 HST WFC3-UVIS full-res denoised.jpg', 'NASA/ESA Hubble · public domain', 'Space (NASA)'),
    P('horsehead', 'Horsehead and Flame nebulae', 'Ic434 Horsehead Nebula B33 Flame Nebula Ngc2024.jpg', 'Wikimedia Commons · CC0', 'Space (NASA)'),
    P('horsehead2', 'Horsehead nebula field', 'Horsehead flame nebula logoga.jpg', 'Wikimedia Commons · CC0', 'Space (NASA)'),
    P('milkyway-centre', 'Centre of the Milky Way', 'Center of the Milky Way Galaxy IV – Composite.jpg', 'NASA / ESA / CXC · public domain', 'Space (NASA)'),
    P('earthrise-orion', 'Earthrise (Artemis II, Orion)', 'Earthrise Captured by Orion (art002e016299).jpg', 'NASA · public domain', 'Space (NASA)'),
    P('earth-aurora', 'Aurora and cities from orbit', 'ISS-43 Earth sunrise, aurora and sparling cities in northern Europe.jpg', 'NASA · public domain', 'Earth from orbit'),
    P('earth-europe-night', 'Europe at night', 'ISS-65 Europe, city lights from space.jpg', 'NASA · public domain', 'Earth from orbit'),
    P('earth-java', 'Lights of Java', 'Lights of Java.jpg', 'NASA · public domain', 'Earth from orbit'),
    P('earth-japan', 'Japan city lights', 'City lights outline southern Japan from Fukuoka to Tokyo (iss073e0824492).jpg', 'NASA · public domain', 'Earth from orbit'),
    P('aurora-jem', 'Aurora from the Space Station', 'ISS-45 Aurora and Stars From the Space Station\'s JEM Window.jpg', 'NASA · public domain', 'Earth from orbit'),
    P('aurora-antarctica', 'Aurora above Antarctica', 'ISS-52 Aurora australis above Antarctica.jpg', 'NASA · public domain', 'Earth from orbit'),
    P('aurora-night', 'Aurora at night', 'Image of aurora at night from the ISS 01.jpg', 'NASA · public domain', 'Earth from orbit'),
  ];
  L.photoGroups = [...new Set(L.photos.map((p) => p.group))].map((g) => [g, L.photos.filter((p) => p.group === g)]);
  L.photoUrl = (key, w = 1920) => { const p = L.photos.find((x) => x.key === key); return p ? 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encodeURIComponent(p.file.replace(/ /g, '_')) + '?width=' + w : ''; };
  /* wallpapers removed in 1.19 (drawn space / anime / futuristic scenes) fall back to Misty forest */
  L.removed = (id) => /^land:(space|anime|fut)-/.test(id);
})();
