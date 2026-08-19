# Auditoría y fusión del catálogo de personajes

Fecha: 2026-08-08T05:57:21.907Z

## Procedimientos realizados

1. Se validó que los dos archivos tuvieran la estructura `{ "personajes": [] }`
   y que cada registro incluyera nombre, género, serie, valor, tag e ID.
2. Se creó una copia de seguridad del catálogo original en
   `data/personajes.json.before-fusion.json`.
3. Se comparó la identidad por `nombre + serie`. Los registros que ya estaban
   en el bot conservaron exactamente sus valores, IDs y campos adicionales.
4. Los valores nuevos se escalaron linealmente desde el máximo externo
   (42891) al rango que usa el bot: 100–14000.
   Los ceros y valores menores al mínimo quedaron en 100.
5. Se hicieron únicos los nombres visibles, tags e IDs de los registros nuevos
   cuando había colisiones. Esto evita que `#claim`, `#vote` y las búsquedas
   de imágenes elijan silenciosamente otro personaje.
6. Se escribió el catálogo fusionado y se validó de nuevo al arrancar el bot.

## Resultado

| Métrica | Cantidad |
|---|---:|
| Personajes anteriores | 4225 |
| Registros externos revisados | 50000 |
| Registros externos ya existentes (conservados) | 711 |
| Personajes nuevos añadidos | 49288 |
| Total final | 53513 |
| Valores externos en cero/no numéricos | 4640 |
| Valores externos menores a 100 | 31902 |
| Nombres nuevos desambiguados | 20136 |
| Tags nuevos reparados | 18897 |
| IDs nuevos reparados | 59 |

## Distribución final por rareza

Los cortes del bot son: Común <700, Raro 700–999, Épico 1000–1499 y
Legendario ≥1500.

```json
{
  "comun": 45852,
  "raro": 2168,
  "epico": 1570,
  "legendario": 3923
}
```

## Comprobación final

- Identidades `nombre + serie` repetidas: 0.
- Tags repetidos: 0.
- IDs repetidos: 0.
- Valores inválidos después de normalizar: 0.
