import type { Building, RentalDataset, RentalUnit } from './types';

function stripUnitForPublic(unit: RentalUnit): RentalUnit {
  return {
    ...unit,
    contactId: '',
    updatedBy: '',
    internalNotes: '',
    trust: {
      ...unit.trust,
      contactId: '',
      updatedBy: '',
      internalNotes: ''
    }
  };
}

function stripBuildingForPublic(building: Building, units: RentalUnit[], includeDetails: boolean): Building {
  const publicUnits = units.filter(unit => unit.buildingId === building.id).map(stripUnitForPublic);
  return {
    ...building,
    contactId: '',
    updatedBy: '',
    internalNotes: '',
    trust: {
      ...building.trust,
      contactId: '',
      updatedBy: '',
      internalNotes: ''
    },
    units: includeDetails ? publicUnits : [],
    photos: includeDetails ? building.photos : [],
    pois: includeDetails ? building.pois : []
  };
}

export function toPublicRentalDataset(dataset: RentalDataset): RentalDataset {
  const units = dataset.units.map(stripUnitForPublic);
  return {
    ...dataset,
    buildings: dataset.buildings.map(building => stripBuildingForPublic(building, units, true)),
    units,
    contacts: [],
    agents: [],
    dataSources: dataset.dataSources.map(source => ({ ...source, notes: '' })),
    changeLog: []
  };
}

export function toInitialRentalDataset(dataset: RentalDataset): RentalDataset {
  const units = dataset.units.map(stripUnitForPublic);
  return {
    ...dataset,
    buildings: dataset.buildings.map(building => stripBuildingForPublic(building, units, false)),
    units: [],
    photos: [],
    pois: [],
    contacts: [],
    agents: [],
    dataSources: dataset.dataSources.map(source => ({ ...source, notes: '' })),
    changeLog: []
  };
}

export function toPublicBuildingDetail(dataset: RentalDataset, buildingId: string): Building | null {
  const units = dataset.units.map(stripUnitForPublic);
  const building = dataset.buildings.find(item => item.id === buildingId);
  if (!building) return null;
  return stripBuildingForPublic(building, units, true);
}
