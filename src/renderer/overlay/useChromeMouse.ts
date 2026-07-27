import { useEffect } from 'react';

/**
 * Hace clicables los controles del overlay aunque los clics sean atravesables.
 *
 * El problema: durante una llamada el overlay se configura con
 * `setIgnoreMouseEvents(true, { forward: true })` para que los clics lleguen a
 * la ventana de debajo. Eso también hace inclicables el engranaje y la X.
 *
 * La solución que permite `forward: true` es que la ventana sigue recibiendo
 * los eventos de MOVIMIENTO aunque ignore los clics. Así que el renderer puede
 * saber dónde está el cursor y pedirle al main que deje de ignorar el ratón
 * justo mientras esté sobre un elemento marcado con `data-interactive`.
 *
 * Se marcan los elementos con un atributo en lugar de comprobar coordenadas
 * porque así el CSS puede mover los botones sin que esta lógica se entere.
 */
export function useChromeMouse(): void {
  useEffect(() => {
    // Estado local para no inundar el IPC: solo se avisa en los cambios.
    let ignoring = true;

    const apply = (next: boolean): void => {
      if (next === ignoring) return;
      ignoring = next;
      window.api.window.setMouseIgnore(next);
    };

    const onMouseMove = (event: MouseEvent): void => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const interactive = element?.closest('[data-interactive]') != null;
      apply(!interactive);
    };

    // Al salir de la ventana hay que devolver el paso de clics sí o sí: si el
    // cursor sale rápido por un borde puede no llegar un último mousemove
    // dentro de una zona no interactiva, y la ventana se quedaría capturando
    // el ratón sobre la videollamada.
    const onMouseLeave = (): void => apply(true);

    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseleave', onMouseLeave);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseleave', onMouseLeave);
      // Restaurar al desmontar, o el overlay se quedaría capturando clics.
      window.api.window.setMouseIgnore(true);
    };
  }, []);
}

/**
 * Arrastre de la ventana con el botón izquierdo.
 *
 * El movimiento lo hace el proceso main siguiendo el cursor: aquí sólo se
 * marcan el inicio y el final. Un `mouseup` global (no en el elemento) porque
 * al arrastrar rápido el cursor se sale de la barra antes de soltar.
 */
export function useOverlayDrag(): (event: React.MouseEvent) => void {
  useEffect(() => {
    const onMouseUp = (): void => window.api.window.endDrag();
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mouseup', onMouseUp);
      window.api.window.endDrag();
    };
  }, []);

  return (event: React.MouseEvent) => {
    // Solo botón izquierdo, y no cuando se pulsa sobre un botón de la barra.
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    window.api.window.startDrag();
  };
}
