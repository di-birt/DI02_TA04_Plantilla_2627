import { Component, signal, computed, inject } from '@angular/core';
import { IonicModule, AlertController, ModalController, ToastController, LoadingController } from '@ionic/angular';
import { Restaurante } from '../interface/restaurante';
import { RestauranteService } from '../services/restaurante.service';
import { AddRestauranteModalComponent } from '../components/add-restaurante-modal/add-restaurante-modal.component';
import restaurantesJSON from '../../assets/datos/restaurantes.json';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [IonicModule],
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss']
})
export class HomePage {

  // ############################### REGION DATOS ###############################

  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private modalCtrl = inject(ModalController);
  private restauranteService = inject(RestauranteService);

  // Restaurantes leídos del JSON local (usados para la importación a Firebase)
  restaurantes: Restaurante[] = restaurantesJSON as Restaurante[];

  // Signal principal con los restaurantes actualmente cargados (vacío hasta que el usuario pulsa "Cargar datos")
  restaurantesCargados = signal<Restaurante[]>([]);

  // true durante la carga de datos
  cargando = signal(false);

  // true durante la importación del JSON a Firebase
  importando = signal(false);

  // true cuando hay al menos un restaurante cargado
  hayDatos = computed(() => this.restaurantesCargados().length > 0);

  // Carga los restaurantes desde Firebase y muestra un toast de confirmación
  async cargarDatos() {
    this.cargando.set(true);
    try {
      const datos = await this.restauranteService.getAll();
      this.restaurantesCargados.set(datos);
      this.mostrarToast(`${datos.length} restaurantes cargados`, 'success');
    } catch {
      this.mostrarToast('Error al cargar los datos desde Firebase', 'danger');
    } finally {
      this.cargando.set(false);
    }
  }

  // Muestra un diálogo de confirmación antes de iniciar la importación
  async confirmarImportacion() {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar importación',
      subHeader: `Se importarán ${this.restaurantes.length} restaurantes`,
      message: 'Los datos actuales de Firebase serán borrados y reemplazados con los del archivo local. ¿Deseas continuar?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Sí, importar', role: 'confirm', handler: () => this.importarJSON() }
      ]
    });
    await alert.present();
  }

  // Borra todos los datos de Firebase y sube los restaurantes del JSON local
  async importarJSON() {
    this.importando.set(true);
    const loading = await this.loadingCtrl.create({
      message: 'Borrando datos anteriores...',
      backdropDismiss: false
    });
    await loading.present();
    try {
      await this.restauranteService.deleteAll();
      loading.message = 'Subiendo restaurantes...';
      await this.restauranteService.addAll(this.restaurantes);
      await loading.dismiss();
      this.mostrarToast(`${this.restaurantes.length} restaurantes importados correctamente`, 'success');
    } catch (error: any) {
      await loading.dismiss();
      console.error('Error al importar JSON:', error);
      const msg = error?.code === 'permission-denied'
        ? 'Sin permisos en Firebase. Revisa las reglas de seguridad.'
        : 'Error al importar. Revisa tu conexión a internet.';
      this.mostrarToast(msg, 'danger');
    } finally {
      this.importando.set(false);
    }
  }

  // TODO - Muestra confirmación y borra el restaurante indicado de Firebase y de la lista local
  async borrarRestaurante(r: Restaurante) {
    //TODO - Crear AlertController con header, subheader, message y buttons
    const alert = await this.alertCtrl.create({
      header: 'Confirmar borrado',
      subHeader: `¿Deseas borrar el restaurante ${r.documentName}?`,
      message: `Este proceso es irreversible`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Borrar', role: 'confirm', cssClass: 'danger',
          //El handler solo se ejecuta cuando el usuario pulsa ese botón
          handler: async () => {
            if (!r.id) {
              this.mostrarToast('No se puede borrar: el restaurante no tiene ID.', 'danger');
              return;
            }
            try {
              //TODO - Llamar al método delete del servicio.
              
              //Actualizamos la lista restaurantesCargados filtrando todos los restaurantes que no sean este que hemos borrado.
              //Recordar que filter recorre todos los elementos y devuelve un nuevo array solo con los que cumplen la condición.
              this.restaurantesCargados.update(lista => lista.filter(x => x.id !== r.id));
              this.mostrarToast(`${r.documentName} eliminado`, 'success');
            } catch {
              this.mostrarToast('Error al borrar el restaurante', 'danger');
            }
          }
        }
      ]
    });
    await alert.present();
  }

  // Abre el modal para añadir un restaurante nuevo
  async abrirModalAnadir() {
    const modal = await this.modalCtrl.create({
      component: AddRestauranteModalComponent,
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'confirm') {
      await this.cargarDatos();
    }
  }

  // Muestra un toast con el mensaje y color indicados
  private async mostrarToast(mensaje: string, color: 'success' | 'danger' | 'warning') {
    const toast = await this.toastCtrl.create({
      message: mensaje,
      duration: 3000,
      color,
      position: 'bottom',
      buttons: [{ text: 'X', role: 'cancel' }]
    });
    await toast.present();
  }


  // ############################### REGION FILTROS (estado general) ###############################

  textoBusqueda = signal('');

  // true si hay algún filtro activo (texto, territorio o localidades)
  hayFiltrosActivos = computed(() =>
    !!this.textoBusqueda() ||
    !!this.territorioSeleccionado() ||
    this.localidadesSeleccionadas().length > 0
  );

  // Resetea todos los filtros a sus valores iniciales
  limpiarTodosFiltros() {
    this.textoBusqueda.set('');
    this.territorioSeleccionado.set('');
    this.localidadesSeleccionadas.set([]);
  }

  // ############################### REGION TERRITORIOS ###############################

  territorioSeleccionado = signal('');

  // Lista de territorios únicos disponibles, ordenada alfabéticamente
  territoriosFiltrados = computed(() => {
    const territorios = this.restaurantesCargados().map(r => r.territory);
    return Array.from(new Set(territorios)).sort();
  });

  // Actualiza el territorio seleccionado y elimina las localidades que ya no pertenecen a él
  onTerritorioChange(value: string) {
    this.territorioSeleccionado.set(value);
    const nuevasLocalidades = this.localidadesSeleccionadas().filter(loc =>
      this.localidadesFiltradasPorTerritorio().includes(loc)
    );
    this.localidadesSeleccionadas.set(nuevasLocalidades);
  }

  // ############################### REGION LOCALIDADES ###############################

  localidadesSeleccionadas = signal<string[]>([]);

  // Lista de localidades únicas del territorio seleccionado (o de todos si no hay territorio), ordenada alfabéticamente
  localidadesFiltradasPorTerritorio = computed(() => {
    let lista = this.restaurantesCargados();
    const territorio = this.territorioSeleccionado().toLowerCase().trim();
    if (territorio) {
      lista = lista.filter(r => r.territory?.toLowerCase().trim() === territorio);
    }
    const localities = lista.map(r => r.locality?.trim()).filter((l): l is string => !!l);
    return Array.from(new Set(localities)).sort();
  });

  // Actualiza las localidades seleccionadas con los valores del evento
  onLocalidadesChange(value: string[]) {
    this.localidadesSeleccionadas.set(value);
  }

  // ############################### REGION RESULTADOS ###############################

  // Lista filtrada de restaurantes según todos los filtros activos
  restaurantesFiltrados = computed(() => {
    let lista = this.restaurantesCargados();

    const texto = this.textoBusqueda().toLowerCase().trim();
    if (texto) {
      lista = lista.filter(r => r.documentName.toLowerCase().includes(texto));
    }

    const territorio = this.territorioSeleccionado().toLowerCase().trim();
    if (territorio) {
      lista = lista.filter(r => r.territory.toLowerCase().trim() === territorio);
    }

    const seleccionadas = this.localidadesSeleccionadas();
    if (seleccionadas.length > 0) {
      lista = lista.filter(r => seleccionadas.includes(r.locality?.trim() || ''));
    }

    return lista;
  });

  // ############################### REGION AUXILIARES ###############################

  // Devuelve el número de estrellas Michelin (0 si no tiene o el valor no es numérico)
  estrellasMichelin(r: Restaurante): number {
    return Number(r.michelinStar) || 0;
  }

  // Devuelve el número de soles Repsol (0 si no tiene o el valor no es numérico)
  repsolSoles(r: Restaurante): number {
    return Number(r.repsolSun) || 0;
  }
}