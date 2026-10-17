# Esencia

Comparador de precios de perfumes enfocado en Chile. La app consulta Google Shopping para Chile (CLP) mediante un backend Node. También ofrece búsquedas directas en tiendas chilenas de retail y perfumería.

## Tiendas incluidas

Retail: Falabella, Paris, Ripley, DBS Beauty Store, Maicao y Preunic.

Perfumerías: Jashan, Chile Perfume, TusPerfumes.cl, Sarun, OfertaPerfumes y Fragante Chile. También incluye Mercado Libre Chile y Google Shopping. Los enlaces directos aparecen tras cada búsqueda.

## Búsqueda en línea dentro de Esencia

La comparación integrada usa Google Shopping a través de SerpApi con país Chile y moneda CLP. Crea una API key en [serpapi.com](https://serpapi.com/) y configúrala como `SERPAPI_API_KEY` en el backend. La clave nunca se incluye en la app ni en el APK.

### Ejecutar localmente

```sh
cp .env.example .env
# Edita .env y agrega SERPAPI_API_KEY
npm start
```

El servicio estará en `http://localhost:8787`. Guarda una observación cuando una búsqueda nueva trae precios, almacena los resultados en caché durante cinco minutos y limita las consultas por IP.

### Historial de precios

Cada resultado recibe un identificador estable por producto y tienda. La app muestra una gráfica con las observaciones que el servidor ha registrado en búsquedas sucesivas. El historial empieza a acumularse después de la primera consulta y no representa un seguimiento diario programado.

El servidor local guarda el historial en `data/price-history.jsonl`. El sistema de archivos gratuito de Render puede reiniciarse al desplegar o reiniciar el servicio; para conservar el historial en producción, configura almacenamiento persistente o conecta una base de datos antes de usarlo como servicio público.

Si defines `DATABASE_URL`, el backend usa PostgreSQL para guardar y consultar las observaciones. Render ofrece Postgres gratis por 30 días; después elimina la base y sus datos si no se actualiza a un plan de pago. El APK se puede compilar con `ESENCIA_API_BASE_URL=https://tu-servicio.onrender.com npm run android:debug` para que apunte al backend desplegado.

## Desplegar el backend

`render.yaml` define el servicio Node. Sube el repo a GitHub y crea un Blueprint desde Render; durante la configuración añade la clave `SERPAPI_API_KEY`. Copia la URL pública del backend en **Configuración de búsqueda en la app**. El APK no puede llamar al servidor local de tu computador.

## APK Android

Con Node.js, Android SDK y Java instalados:

```sh
npm install
npm run android:sync
cd android && ./gradlew assembleDebug
```

El APK de depuración queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Para publicarlo, configura una clave de firma de release.

## Imágenes y precios

Las tarjetas usan la miniatura entregada por Google Shopping y enlazan a la página de origen del vendedor. Los precios y la disponibilidad pueden cambiar; confirma el precio final, tamaño, concentración y condiciones de despacho en la tienda antes de comprar.
