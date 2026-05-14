import { baseApi } from "@platform/ui";
import type {
  Menu,
  PizzaType,
  PizzaTypeCreateBody,
  PizzaTypeUpdateBody,
  ToppingType,
  ToppingTypeCreateBody,
  ToppingTypeUpdateBody,
} from "@/types/menu/menu";

const apiWithTags = baseApi.enhanceEndpoints({
  addTagTypes: ["MenuPizza", "MenuTopping"],
});

const menuApi = apiWithTags.injectEndpoints({
  endpoints: (build) => ({
    getMenu: build.query<Menu, void>({
      query: () => ({ url: "/menu", method: "GET" }),
      providesTags: (result) =>
        result
          ? [
              ...result.pizzas.map((p) => ({
                type: "MenuPizza" as const,
                id: p.id,
              })),
              ...result.toppings.map((t) => ({
                type: "MenuTopping" as const,
                id: t.id,
              })),
              { type: "MenuPizza" as const, id: "LIST" },
              { type: "MenuTopping" as const, id: "LIST" },
            ]
          : [
              { type: "MenuPizza" as const, id: "LIST" },
              { type: "MenuTopping" as const, id: "LIST" },
            ],
    }),
    createPizza: build.mutation<PizzaType, PizzaTypeCreateBody>({
      query: (data) => ({ url: "/menu/pizzas", method: "POST", data }),
      invalidatesTags: [{ type: "MenuPizza", id: "LIST" }],
    }),
    updatePizza: build.mutation<
      PizzaType,
      { id: string; body: PizzaTypeUpdateBody }
    >({
      query: ({ id, body }) => ({
        url: `/menu/pizzas/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "MenuPizza", id },
        { type: "MenuPizza", id: "LIST" },
      ],
    }),
    deletePizza: build.mutation<void, string>({
      query: (id) => ({ url: `/menu/pizzas/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "MenuPizza", id: "LIST" }],
    }),
    createTopping: build.mutation<ToppingType, ToppingTypeCreateBody>({
      query: (data) => ({ url: "/menu/toppings", method: "POST", data }),
      invalidatesTags: [{ type: "MenuTopping", id: "LIST" }],
    }),
    updateTopping: build.mutation<
      ToppingType,
      { id: string; body: ToppingTypeUpdateBody }
    >({
      query: ({ id, body }) => ({
        url: `/menu/toppings/${id}`,
        method: "PATCH",
        data: body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "MenuTopping", id },
        { type: "MenuTopping", id: "LIST" },
      ],
    }),
    deleteTopping: build.mutation<void, string>({
      query: (id) => ({ url: `/menu/toppings/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "MenuTopping", id: "LIST" }],
    }),
  }),
});

export const {
  useGetMenuQuery,
  useCreatePizzaMutation,
  useUpdatePizzaMutation,
  useDeletePizzaMutation,
  useCreateToppingMutation,
  useUpdateToppingMutation,
  useDeleteToppingMutation,
} = menuApi;
