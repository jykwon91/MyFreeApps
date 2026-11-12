/** One screen in a stack, as the navigation state holds it. */
export interface StackRoute {
  name: string;
  params?: Readonly<object>;
}
