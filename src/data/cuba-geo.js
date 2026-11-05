/* CubaLog — Datos geográficos jerárquicos de Cuba
   Provincia -> Municipio -> Localidades
   Municipios: lista oficial (168). Localidades: curadas para cabeceras importantes
   + generador de respaldo para el resto (cabecera + consejos + opción libre).
   Expone global: window.CUBA_GEO = { PROVINCIAS, MUNICIPIOS, localidadDe(), coordsProvincia } */

(function () {
  const PROVINCIAS = [
    "Pinar del Río", "Artemisa", "La Habana", "Mayabeque", "Matanzas",
    "Cienfuegos", "Villa Clara", "Sancti Spíritus", "Ciego de Ávila", "Camagüey",
    "Las Tunas", "Granma", "Holguín", "Santiago de Cuba", "Guantánamo", "Isla de la Juventud"
  ];

  const MUNICIPIOS = {
    "Pinar del Río": ["Consolación del Sur","Guane","La Palma","Los Palacios","Mantua","Minas de Matahambre","Pinar del Río","San Juan y Martínez","San Luis","Sandino","Viñales"],
    "Artemisa": ["Alquízar","Artemisa","Bahía Honda","Bauta","Caimito","Candelaria","Guanajay","Güira de Melena","Mariel","San Antonio de los Baños","San Cristóbal"],
    "La Habana": ["Arroyo Naranjo","Boyeros","Centro Habana","Cerro","Cotorro","Diez de Octubre","Guanabacoa","Habana del Este","Habana Vieja","La Lisa","Marianao","Playa","Plaza de la Revolución","Regla","San Miguel del Padrón"],
    "Mayabeque": ["Batabanó","Bejucal","Güines","Jaruco","Madruga","Melena del Sur","Nueva Paz","Quivicán","San José de las Lajas","San Nicolás","Santa Cruz del Norte"],
    "Matanzas": ["Calimete","Cárdenas","Ciénaga de Zapata","Colón","Jagüey Grande","Jovellanos","Limonar","Los Arabos","Martí","Matanzas","Pedro Betancourt","Perico","Unión de Reyes"],
    "Cienfuegos": ["Abreus","Aguada de Pasajeros","Cienfuegos","Cruces","Cumanayagua","Lajas","Palmira","Rodas"],
    "Villa Clara": ["Caibarién","Camajuaní","Cifuentes","Corralillo","Encrucijada","Manicaragua","Placetas","Quemado de Güines","Ranchuelo","Remedios","Sagua la Grande","Santa Clara","Santo Domingo"],
    "Sancti Spíritus": ["Cabaiguán","Fomento","Jatibonico","La Sierpe","Sancti Spíritus","Taguasco","Trinidad","Yaguajay"],
    "Ciego de Ávila": ["Baraguá","Bolivia","Chambas","Ciego de Ávila","Ciro Redondo","Florencia","Majagua","Morón","Primero de Enero","Venezuela"],
    "Camagüey": ["Camagüey","Céspedes","Esmeralda","Florida","Guáimaro","Jimaguayú","Minas","Najasa","Nuevitas","Santa Cruz del Sur","Sibanicú","Sierra de Cubitas","Vertientes"],
    "Las Tunas": ["Amancio","Colombia","Jesús Menéndez","Jobabo","Majibacoa","Manatí","Puerto Padre","Las Tunas"],
    "Granma": ["Bartolomé Masó","Bayamo","Buey Arriba","Campechuela","Cauto Cristo","Guisa","Jiguaní","Manzanillo","Media Luna","Niquero","Pilón","Río Cauto","Yara"],
    "Holguín": ["Antilla","Báguanos","Banes","Cacocum","Calixto García","Cueto","Frank País","Gibara","Holguín","Mayarí","Moa","Rafael Freyre","Sagua de Tánamo","Urbano Noris"],
    "Santiago de Cuba": ["Contramaestre","Guamá","Mella","Palma Soriano","San Luis","Santiago de Cuba","Segundo Frente","Songo-La Maya","Tercer Frente"],
    "Guantánamo": ["Baracoa","Caimanera","El Salvador","Guantánamo","Imías","Maisí","Manuel Tames","Niceto Pérez","San Antonio del Sur","Yateras"],
    "Isla de la Juventud": ["Isla de la Juventud"]
  };

  // Localidades curadas (las más usadas). Si un municipio no está aquí se genera respaldo.
  const LOCALIDADES_CURADAS = {
    "Pinar del Río": ["Centro Ciudad","Hermanos Cruz","Celso Maragoto","Calle Martí / Malecón","Aeropuerto","Otra / dirección exacta…"],
    "Viñales": ["Viñales Centro","Valle de Viñales","Palmarito","Otra / dirección exacta…"],
    "Artemisa": ["Artemisa Centro","Parque Libertad","Cayajabos","Otra / dirección exacta…"],
    "Mariel": ["Mariel Centro","Puerto del Mariel (ZED)","Quiebra Hacha","Otra / dirección exacta…"],
    "Playa": ["Miramar","Buenavista","Flores","Jaimanitas","Santa Fe","Otra / dirección exacta…"],
    "Plaza de la Revolución": ["Vedado","Nuevo Vedado","El Carmelo","Coppelia / Rampa","Otra / dirección exacta…"],
    "Centro Habana": ["Colón","Cayo Hueso","Pueblo Nuevo","Malecón","Otra / dirección exacta…"],
    "Habana Vieja": ["Catedral","Plaza Vieja","Belén","San Isidro","Otra / dirección exacta…"],
    "Habana del Este": ["Alamar","Cojímar","Guanabo","Santa Cruz / Boca Ciega","Villa Panamericana","Otra / dirección exacta…"],
    "Boyeros": ["Santiago de las Vegas","Aeropuerto José Martí (Terminal 3)","Fontanar","Calabazar","Otra / dirección exacta…"],
    "Marianao": ["Marianao Centro","Pogolotti","Zamora","Otra / dirección exacta…"],
    "Guanabacoa": ["Guanabacoa Centro","D'Beche","Otra / dirección exacta…"],
    "San Miguel del Padrón": ["San Miguel Centro","Juanelo","Diezmero","Otra / dirección exacta…"],
    "Santa Cruz del Norte": ["Santa Cruz Centro","Jibacoa","Boca de Jaruco","Otra / dirección exacta…"],
    "San José de las Lajas": ["San José Centro","Tapaste","Otra / dirección exacta…"],
    "Güines": ["Güines Centro","Otra / dirección exacta…"],
    "Matanzas": ["Matanzas Centro","Versalles","Varadero (zona)","Boca de Camarioca","Otra / dirección exacta…"],
    "Cárdenas": ["Cárdenas Centro","Varadero — Parque Retiro","Varadero — Centro / Calle 64","Boca de Camarioca","Otra / dirección exacta…"],
    "Ciénaga de Zapata": ["Playa Larga","Playa Girón","Boca de Guamá","Otra / dirección exacta…"],
    "Cienfuegos": ["Centro / Prado","Punta Gorda","La Gloria","Reina","Otra / dirección exacta…"],
    "Trinidad": ["Trinidad Centro","Playa Ancón","Topes de Collantes","Otra / dirección exacta…"],
    "Santa Clara": ["Centro / Parque Vidal","Universidad (UCLV)","Reparto Escambray","Aeropuerto Abel Santamaría","Otra / dirección exacta…"],
    "Caibarién": ["Caibarién Centro","Cayo Santa María (pedraplén)","Otra / dirección exacta…"],
    "Remedios": ["Remedios Centro","Cayo Santa María","Otra / dirección exacta…"],
    "Ciego de Ávila": ["Centro","Reparto Vista Alegre","Terminal de Ómnibus","Otra / dirección exacta…"],
    "Morón": ["Morón Centro","Cayo Coco (pedraplén)","Cayo Guillermo","Otra / dirección exacta…"],
    "Camagüey": ["Centro Histórico","Reparto Garrido","Terminal / Rotonda","Aeropuerto","Otra / dirección exacta…"],
    "Florida": ["Florida Centro","Otra / dirección exacta…"],
    "Nuevitas": ["Nuevitas Centro","Playa Santa Lucía","Otra / dirección exacta…"],
    "Las Tunas": ["Centro / Parque Vicente García","Buena Vista","Aeropuerto","Otra / dirección exacta…"],
    "Bayamo": ["Centro / Plaza del Himno","Reparto Siboney","Otra / dirección exacta…"],
    "Manzanillo": ["Manzanillo Centro","Puerto","Otra / dirección exacta…"],
    "Holguín": ["Centro / Parque Calixto García","Reparto Lenin","Guardalavaca","Playa Esmeralda","Aeropuerto Frank País","Otra / dirección exacta…"],
    "Moa": ["Moa Centro","Puerto de Moa","Otra / dirección exacta…"],
    "Santiago de Cuba": ["Centro / Parque Céspedes","Vista Alegre","Sueño","El Caney","Aeropuerto Antonio Maceo","El Morro","Otra / dirección exacta…"],
    "Palma Soriano": ["Palma Centro","Otra / dirección exacta…"],
    "Guantánamo": ["Centro / Parque Martí","Reparto Caribe","Otra / dirección exacta…"],
    "Baracoa": ["Baracoa Centro","Malecón","Yumurí","Otra / dirección exacta…"],
    "Isla de la Juventud": ["Nueva Gerona","La Fe","Playa Bibijagua","Puerto de Nueva Gerona","Otra / dirección exacta…"]
  };

  // Coordenadas aproximadas de capitales provinciales (fallback si Nominatim falla/offline)
  const COORDS_PROV = {
    "Pinar del Río": [22.4167, -83.7],
    "Artemisa": [22.8167, -82.7667],
    "La Habana": [23.1136, -82.3666],
    "Mayabeque": [22.9617, -82.1617],
    "Matanzas": [23.0511, -81.5775],
    "Cienfuegos": [22.1496, -80.4464],
    "Villa Clara": [22.4244, -79.9417],
    "Sancti Spíritus": [21.9297, -79.4428],
    "Ciego de Ávila": [21.8489, -78.7619],
    "Camagüey": [21.3808, -77.9169],
    "Las Tunas": [21.0594, -76.9556],
    "Granma": [20.38, -76.6428],
    "Holguín": [20.8885, -76.2572],
    "Santiago de Cuba": [20.0247, -75.8217],
    "Guantánamo": [20.1389, -75.2086],
    "Isla de la Juventud": [21.75, -82.85]
  };

  function localidadesDe(municipio) {
    if (LOCALIDADES_CURADAS[municipio]) return LOCALIDADES_CURADAS[municipio].slice();
    // Respaldo genérico pero útil: cabecera + zonas + libre
    return [municipio + " — Centro", "Consejo Popular Norte", "Consejo Popular Sur", "Zona rural / Cooperativa", "Terminal / Parada principal", "Otra / dirección exacta…"];
  }
  function municipiosDe(prov) { return (MUNICIPIOS[prov] || []).slice(); }

  window.CUBA_GEO = { PROVINCIAS, MUNICIPIOS, LOCALIDADES_CURADAS, COORDS_PROV, localidadesDe, municipiosDe };
})();
