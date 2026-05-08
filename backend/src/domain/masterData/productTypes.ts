export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'RETIRED';

export interface Product {
  id: number;
  productCode: string;
  productName: string;
  moleculeName: string | null;
  productFamily: string | null;
  modality: string | null;
  defaultScaleLiters: number | null;
  status: ProductStatus;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}
