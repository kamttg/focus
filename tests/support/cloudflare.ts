export class DurableObject<T> {
  constructor(protected ctx: any, protected env: T) {}
}
