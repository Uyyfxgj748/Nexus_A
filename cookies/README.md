# 🍪 Carpeta de Cookies

Cada archivo `.txt` de esta carpeta contiene las cookies de una plataforma en **formato Netscape** (el mismo que usa yt-dlp y los navegadores).

## Archivos

| Archivo | Plataforma | Para qué sirve |
|---|---|---|
| `youtube.txt` | YouTube | Videos con restricción de edad, contenido de cuentas |
| `tiktok.txt` | TikTok | Cuentas privadas, videos restringidos |
| `facebook.txt` | Facebook | Grupos privados, reels con restricciones |
| `pinterest.txt` | Pinterest | Contenido de cuentas privadas |
| `spotify.txt` | Spotify | Descarga directa de canciones |
| `mediafire.txt` | MediaFire | Archivos con restricción de cuenta |
| `terabox.txt` | Terabox | Necesaria para *cualquier* descarga (Terabox exige sesión iniciada, cookie `ndus`) |

## Cómo exportar cookies

1. Instala la extensión **"Get cookies.txt LOCALLY"** en Chrome o Firefox
2. Inicia sesión en la plataforma deseada
3. Haz clic en la extensión y exporta
4. Pega el contenido en el archivo `.txt` correspondiente

## Formato

Los archivos tienen que estar en formato Netscape (una línea por cookie, separada por tabs):

```
# Netscape HTTP Cookie File
.dominio.com  TRUE  /  FALSE  1234567890  nombre_cookie  valor_cookie
```

## Notas

- El bot funciona **sin cookies** para la mayoría de contenido público
- Las cookies solo son necesarias para contenido restringido o privado
- Actualiza las cookies si empiezan a fallar (expiran periódicamente)
