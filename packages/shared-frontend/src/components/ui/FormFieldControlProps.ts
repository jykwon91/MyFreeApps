/** Spread last onto the field's control: `{(field) => <input {...register("x")} {...field} />}`. */
export interface FormFieldControlProps {
  id: string;
  "aria-required"?: true;
}
