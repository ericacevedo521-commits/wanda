# Wanda Soft CMS

Tienda online boutique para **Wanda Soft**, orientada a pijamas, conjuntos y accesorios. Incluye sitio público, CMS propio en `/admin`, API, migraciones de Cloudflare D1 y configuración para Cloudflare Workers.

## Comandos principales

```bash
npm install
npm run dev
npm run build
npm run deploy
```

## Desarrollo local

1. Instalar dependencias:

```bash
npm install
```

2. Crear/aplicar la base local D1:

```bash
npm run db:migrate:local
```

3. Levantar el proyecto:

```bash
npm run dev
```

4. Abrir:

- Sitio público: `http://localhost:8787`
- Admin: `http://localhost:8787/admin/login`

Credenciales iniciales locales en `wrangler.jsonc`:

- Usuario: `admin`
- Contraseña: `cambiar-esta-clave`

## Crear base D1 en Cloudflare

```bash
npx wrangler d1 create wanda_soft_db
```

Copiar el `database_id` generado y reemplazarlo en `wrangler.jsonc`.

Aplicar migraciones remotas:

```bash
npm run db:migrate:remote
```

## Variables de entorno

Configurar en Cloudflare Worker:

- `ADMIN_USER`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `PUBLIC_BASE_URL`

También se deja `.env.example` como referencia.

Para producción, cambiar especialmente:

- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `whatsapp_number` desde el CMS

## Deploy en Cloudflare

Configuración solicitada:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Path: `.`

Deploy manual:

```bash
npm run deploy
```

## Admin CMS

Entrar a:

```text
/admin/login
```

Desde el panel se puede editar:

- Home
- Productos
- Categorías
- Preguntas frecuentes
- Ajustes del sitio
- Contacto y redes
- Apariencia básica
- Vista previa

Si falta el número de WhatsApp, el CMS muestra un aviso en Ajustes.

## Configurar WhatsApp

En `/admin` → `ajustes` o `contacto`, completar `whatsapp_number` con formato internacional, por ejemplo:

```text
5491112345678
```

Cada botón “Comprar por WhatsApp” genera un mensaje automático con producto, talle, color y precio.

## Editar productos

En `/admin` → `productos`:

- Crear producto
- Editar nombre, descripción, precio, stock, categoría, cuidado y tabla de talles
- Marcar como destacado
- Ocultar/mostrar producto
- Cargar varias imágenes pegando una URL por línea
- Eliminar producto

Los cambios guardados impactan automáticamente en el sitio público porque se leen desde D1.

## Base de datos

Incluye migraciones:

- `migrations/0001_initial.sql`: estructura de tablas
- `migrations/0002_seed.sql`: datos demo iniciales

Tablas principales:

- `products`
- `product_images`
- `categories`
- `sizes`
- `colors`
- `product_variants`
- `homepage_sections`
- `site_settings`
- `banners`
- `faqs`
- `admin_sessions`
- `cms_content_blocks`

## Backup básico de D1

Exportar base remota:

```bash
npx wrangler d1 export wanda_soft_db --remote --output backup.sql
```

Restaurar o importar SQL según necesidad:

```bash
npx wrangler d1 execute wanda_soft_db --remote --file backup.sql
```

## Notas

- No incluye pasarela de pago online.
- La compra se coordina únicamente por WhatsApp.
- Las imágenes iniciales son placeholders SVG editables/reemplazables desde el CMS.
- El frontend está preparado como SPA y el Worker sirve API + assets estáticos.
